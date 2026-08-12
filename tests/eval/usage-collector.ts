import { wrapLanguageModel } from 'ai';
import type { LanguageModel } from 'ai';
import type {
  LanguageModelV4,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';

export type UsageTotals = {
  /** 已收集的 LLM 调用次数 */
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** 缓存命中的输入 token（cacheRead）：P2-3 验证 provider 自动缓存的关键指标 */
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

const EMPTY: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/**
 * 评测 usage 收集器：包装真实 LanguageModel，把每次调用的 usage（含 cacheRead/cacheWrite）
 * 累加到 totals。用途：
 * - 评测报告输出每场景/总 token 用量（设计文档 §7.2 欠的 token 统计）
 * - P2-3 缓存验证：cacheRead > 0 即证明 provider 自动前缀缓存生效（无需显式标记）
 * doStream 的 usage 在流式 finish part 里：tee 出收集分支消费 finish，返回分支供调用方正常使用，
 * 收集分支异步排空失败不影响主流（usage 缺失只影响统计精度，不阻塞评测）。
 */
export function createUsageCollector() {
  let totals: UsageTotals = { ...EMPTY };

  function add(usage: LanguageModelV4Usage): void {
    totals.calls += 1;
    totals.inputTokens += usage.inputTokens.total ?? 0;
    totals.outputTokens += usage.outputTokens.total ?? 0;
    totals.cacheReadTokens += usage.inputTokens.cacheRead ?? 0;
    totals.cacheWriteTokens += usage.inputTokens.cacheWrite ?? 0;
  }

  function reset(): void {
    totals = { ...EMPTY };
  }

  /** 包装模型：getModel() 的真实模型实例，CLI 用包装后的模型跑评测。
   * 用 ai SDK 官方 wrapLanguageModel 中间件（不是对象展开——provider 模型是类实例，
   * 原型方法如 transformRequestBody/convertUsage 展开即丢，SDK 内部调用会崩）。 */
  function wrap<T extends LanguageModel>(model: T): T {
    // wrapLanguageModel 的 model 参数要求具体 V2/V3/V4（不含字符串字面量），运行时是 V4 类实例
    const wrapped = wrapLanguageModel({
      model: model as LanguageModelV4,
      middleware: {
        specificationVersion: 'v4',
        wrapGenerate: async ({ doGenerate }) => {
          const result = await doGenerate();
          add(result.usage);
          return result;
        },
        wrapStream: async ({ doStream }) => {
          const result = await doStream();
          const [collect, use] = result.stream.tee();
          void (async () => {
            try {
              for await (const part of collect as unknown as AsyncIterable<LanguageModelV4StreamPart>) {
                if (part.type === 'finish') add(part.usage);
              }
            } catch {
              // 收集分支异常只影响统计，不阻塞调用方消费返回分支
            }
          })();
          return { ...result, stream: use };
        },
      },
    });
    return wrapped as unknown as T;
  }

  return { get totals() { return totals; }, add, reset, wrap };
}
