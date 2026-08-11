import { scenarios } from './scenarios';
import { runScenario } from './runner';
import { getModel } from '../../src/agent/model';

/** 解析 --k <次数>；其余忽略。默认 k=2。模型经环境变量 LLM_MODEL 指定（getModel() 读取） */
function parseArgs(argv: string[]): { k: number } {
  let k = 2;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--k' && argv[i + 1]) k = Number(argv[i + 1]) || 2;
  }
  return { k };
}

async function main() {
  const { k } = parseArgs(process.argv.slice(2));
  const model = getModel(); // 真实模型：环境变量 LLM_BASE_URL/LLM_API_KEY/LLM_MODEL 配置；换模型设 LLM_MODEL 后运行
  // pass^k 一致性：每场景 k 次全过才判 pass
  let passed = 0;
  let failed = 0;
  const startedAt = Date.now();
  for (const scenario of scenarios) {
    let scenarioPassed = true;
    let lastError = '';
    for (let i = 0; i < k; i++) {
      // 单场景 2 分钟超时：真实模型挂起时该次计 fail，继续下一场景（防跑飞阻塞全量）
      const result = await runScenario(scenario, { model, timeoutMs: 120_000 });
      if (!result.ok) {
        scenarioPassed = false;
        lastError = result.error;
      }
    }
    if (scenarioPassed) {
      passed++;
      console.log(`[PASS] ${scenario.id} (${k}/${k})`);
    } else {
      failed++;
      console.log(`[FAIL] ${scenario.id} (${k} 次未全过) 最后失败：${lastError.slice(0, 300)}`);
    }
  }
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n结果：${passed}/${scenarios.length} 通过（pass^${k}），耗时 ${elapsed}s`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('评测运行异常：', err);
  process.exit(1);
});
