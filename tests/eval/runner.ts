import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { LanguageModel } from 'ai';
import type Database from 'better-sqlite3';
import { initDb, db } from '../../src/db';
import { createConversation } from '../../src/db/repositories/conversations';
import { clearModelOverride, setModelOverride } from '../../src/agent/model';
import { runAgentTurn } from '../../src/agent/run-agent';
import { toUserMessage, type Scenario, type ScenarioContext } from './scenarios/types';
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

/** initDb 后的原生 better-sqlite3 连接（drizzle 实例经 $client 暴露） */
function rawDb(): Database.Database {
  return (db as unknown as { $client: Database.Database }).$client;
}

export type ScenarioResult =
  | { ok: true; scenarioId: string; messageCount: number }
  | { ok: false; scenarioId: string; error: string; messageCount: number };

/** 执行单个场景（临时库隔离；mock/真实两层共用）。结束后恢复默认连接供后续测试文件使用 */
export async function runScenario(
  scenario: Scenario,
  opts: { model: LanguageModel },
): Promise<ScenarioResult> {
  initDb(':memory:');
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  cleanupEvalPlans();

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

  const conversation = createConversation(scenario.id);
  setModelOverride(opts.model);
  try {
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
    scenario.assertFinalState(ctx);
    return { ok: true, scenarioId: scenario.id, messageCount: assistantTexts.length };
  } catch (err) {
    return {
      ok: false,
      scenarioId: scenario.id,
      error: err instanceof Error ? err.message : String(err),
      messageCount: assistantTexts.length,
    };
  } finally {
    clearModelOverride();
    cleanupEvalPlans();
    // 恢复默认连接：评测临时库只在本场景内有效，供后续测试文件（串行）正常使用 dev 库
    initDb();
  }
}
