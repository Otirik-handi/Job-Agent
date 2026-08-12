import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { LanguageModel } from 'ai';
import type Database from 'better-sqlite3';
import { getDb, initDb } from '../../src/db';
import { createConversation } from '../../src/db/repositories/conversations';
import { clearModelOverride, setModelOverride } from '../../src/agent/model';
import { clearEmbeddingOverride } from '../../src/agent/embedding';
import { runAgentTurn } from '../../src/agent/run-agent';
import { toUserMessage, type Scenario, type ScenarioContext } from './scenarios/types';
import { restoreWebNetwork } from './web-network-stub';
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const PLANS_DIR = path.resolve(process.cwd(), 'data', 'plans');

/** 清理评测产生的计划文件（eval- 前缀；评测与 dev 库共用 data/plans/） */
function cleanupEvalPlans(): void {
  try {
    for (const file of readdirSync(PLANS_DIR)) {
      if (file.startsWith('eval-')) rmSync(path.join(PLANS_DIR, file));
    }
  } catch { /* 目录不存在则忽略 */ }
}

/** initDb 后的原生 better-sqlite3 连接（drizzle 实例经 $client 暴露；经 getDb 实时读取当前连接） */
function rawDb(): Database.Database {
  return (getDb() as unknown as { $client: Database.Database }).$client;
}

export type ScenarioResult =
  | { ok: true; scenarioId: string; messageCount: number }
  | { ok: false; scenarioId: string; error: string; messageCount: number };

/** 执行单个场景（临时库隔离；mock/真实两层共用）。结束后恢复默认连接供后续测试文件使用 */
export async function runScenario(
  scenario: Scenario,
  opts: { model: LanguageModel; timeoutMs?: number; assert?: (ctx: ScenarioContext) => void },
): Promise<ScenarioResult> {
  // 超时定时器句柄：真实层传 timeoutMs 时启用（mock 层不传，vitest 已有 60s 用例超时）
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

  const assistantTexts: string[] = [];
  const ctx: ScenarioContext = {
    query: <T = Record<string, unknown>>(sqlStr: string, params: unknown[] = []): T | null => {
      const row = rawDb().prepare(sqlStr).get(...params);
      return (row as T | undefined) ?? null;
    },
    exec: (sqlStr: string, params: unknown[] = []) => {
      rawDb().prepare(sqlStr).run(...params);
    },
    allAssistantText: () => assistantTexts.join('\n'),
  };

  try {
    // 临时库初始化随 try 走：migrate 抛错也会落入 catch 计 fail，且 finally 一定执行恢复
    initDb(':memory:');
    migrate(getDb(), { migrationsFolder: 'src/db/migrations' });
    cleanupEvalPlans();

    const conversation = createConversation(scenario.id);
    setModelOverride(opts.model);

    // 执行段：setup + 逐轮 runAgentTurn + 终态断言。真实层传 timeoutMs 时整段限时——
    // 挂起的 LLM 调用无法强制中断，超时后底层 runAgentTurn 可能仍在跑，但 CLI 会继续
    // 下一场景；每场景独立 :memory: 库，无状态污染。
    const runExecution = async (): Promise<void> => {
      scenario.setup(ctx);
      for (let i = 0; i < scenario.userMessages.length; i++) {
        const result = await runAgentTurn({
          conversationId: conversation.id,
          messages: [toUserMessage(scenario.userMessages[i], i)],
          model: opts.model,
        });
        for (const m of result.messages) {
          const text = m.parts
            .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map((p) => p.text)
            .join('');
          if (text) assistantTexts.push(text);
        }
      }
      (opts.assert ?? scenario.assertFinalState)(ctx);
    };

    if (opts.timeoutMs === undefined) {
      await runExecution();
    } else {
      await Promise.race([
        runExecution(),
        new Promise<never>((_, reject) => {
          timeoutTimer = setTimeout(
            () => reject(new Error(`场景超时（>${opts.timeoutMs}ms）`)),
            opts.timeoutMs,
          );
        }),
      ]);
    }
    return { ok: true, scenarioId: scenario.id, messageCount: assistantTexts.length };
  } catch (err) {
    return {
      ok: false,
      scenarioId: scenario.id,
      error: err instanceof Error ? err.message : String(err),
      messageCount: assistantTexts.length,
    };
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    clearModelOverride();
    clearEmbeddingOverride();
    // 网络隔离恢复：mock 层 web 场景（company-research）在 setup 里 stub 了全局 fetch，必须还原
    restoreWebNetwork();
    cleanupEvalPlans();
    // 恢复默认连接：评测临时库只在本场景内有效，供后续测试文件（串行）正常使用 dev 库
    initDb();
  }
}
