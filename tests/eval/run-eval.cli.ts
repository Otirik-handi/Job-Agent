import { scenarios } from './scenarios';
import { runScenario } from './runner';
import { getModel } from '../../src/agent/model';
import { createUsageCollector } from './usage-collector';

/** 解析 --k <次数> 与 --scenario <id>（可选，只跑指定场景）；其余忽略。默认 k=2。模型经环境变量 LLM_MODEL 指定 */
function parseArgs(argv: string[]): { k: number; scenarioId: string | null } {
  let k = 2;
  let scenarioId: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--k' && argv[i + 1]) k = Number(argv[i + 1]) || 2;
    if (argv[i] === '--scenario' && argv[i + 1]) scenarioId = argv[i + 1];
  }
  return { k, scenarioId };
}

/** 千分位缩写（如 1234 → 1.2k），用于报告 token 量 */
function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** 缓存命中率（%）：cacheRead / (cacheRead + noCache)，分母为 0 时输出 '-' */
function cacheHitRate(cacheRead: number, noCache: number): string {
  const total = cacheRead + noCache;
  return total === 0 ? '-' : `${Math.round((cacheRead / total) * 100)}%`;
}

async function main() {
  const { k, scenarioId } = parseArgs(process.argv.slice(2));
  const usage = createUsageCollector();
  const model = usage.wrap(getModel()); // 真实模型（环境变量 LLM_BASE_URL/LLM_API_KEY/LLM_MODEL 配置）；包装层收集 token/缓存统计
  const targets = scenarioId ? scenarios.filter((s) => s.id === scenarioId) : scenarios;
  if (scenarioId && targets.length === 0) {
    console.error(`场景 ${scenarioId} 不存在`);
    process.exit(1);
  }
  // pass^k 一致性：每场景 k 次全过才判 pass
  let passed = 0;
  let failed = 0;
  const startedAt = Date.now();
  for (const scenario of targets) {
    let scenarioPassed = true;
    let lastError = '';
    usage.reset();
    for (let i = 0; i < k; i++) {
      // 单场景超时（全局 180s，可被场景 realTimeoutMs 覆盖）：真实模型挂起时该次计 fail，继续下一场景（防跑飞阻塞全量）
      const result = await runScenario(scenario, {
        model,
        timeoutMs: scenario.realTimeoutMs ?? 180_000,
        // 真实层用分层断言：mock 脚本预设的模型行为（自选 taskId/追问策略）在真实层不成立时放宽
        assert: scenario.assertFinalStateReal ?? scenario.assertFinalState,
      });
      if (!result.ok) {
        scenarioPassed = false;
        lastError = result.error;
      }
    }
    const t = usage.totals;
    // token 用量：input（含缓存命中）/ output / cacheRead；命中率 = cacheRead 占输入比例（P2-3 缓存验证指标）
    const tokenReport = `tokens in=${fmtTokens(t.inputTokens)} out=${fmtTokens(t.outputTokens)} cache=${fmtTokens(t.cacheReadTokens)}(${cacheHitRate(t.cacheReadTokens, t.inputTokens - t.cacheReadTokens - t.cacheWriteTokens)})`;
    if (scenarioPassed) {
      passed++;
      console.log(`[PASS] ${scenario.id} (${k}/${k}) ${tokenReport}`);
    } else {
      failed++;
      console.log(`[FAIL] ${scenario.id} (${k} 次未全过) ${tokenReport} 最后失败：${lastError.slice(0, 300)}`);
    }
  }
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const total = usage.totals;
  const totalHit = cacheHitRate(total.cacheReadTokens, total.inputTokens - total.cacheReadTokens - total.cacheWriteTokens);
  console.log(`\n结果：${passed}/${targets.length} 通过（pass^${k}），耗时 ${elapsed}s，总 token in=${fmtTokens(total.inputTokens)} out=${fmtTokens(total.outputTokens)} cacheRead=${fmtTokens(total.cacheReadTokens)}（命中率 ${totalHit}）`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('评测运行异常：', err);
  process.exit(1);
});
