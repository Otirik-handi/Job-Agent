import { describe, expect, it } from 'vitest';
import { createScriptedModel } from './mock-model';
import { createUsageCollector } from './usage-collector';

describe('createUsageCollector（评测 usage 收集）', () => {
  it('doGenerate 收集 usage：多次调用累加 input/output/cacheRead/cacheWrite', async () => {
    const collector = createUsageCollector();
    const model = collector.wrap(createScriptedModel([
      { type: 'tool-call', toolName: 'listResumes', input: {} },
      { type: 'text', text: '完成' },
    ]));
    await model.doGenerate({} as never);
    await model.doGenerate({} as never);
    // scripted model 固定 usage：input 1 / output 1 / cacheRead 0 / cacheWrite 0
    expect(collector.totals).toEqual({ calls: 2, inputTokens: 2, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 });
  });

  it('doStream 收集 usage：流式 finish part 计入（消费返回流后）', async () => {
    const collector = createUsageCollector();
    const model = collector.wrap(createScriptedModel([
      { type: 'text', text: '完成' },
    ]));
    const result = await model.doStream({} as never);
    // 消费返回流，触发 finish part 收集
    for await (const _part of result.stream as unknown as AsyncIterable<unknown>) { void _part; }
    expect(collector.totals.calls).toBe(1);
    expect(collector.totals.inputTokens).toBe(1);
    expect(collector.totals.outputTokens).toBe(1);
  });

  it('reset 清空累计', async () => {
    const collector = createUsageCollector();
    const model = collector.wrap(createScriptedModel([{ type: 'text', text: '完成' }]));
    await model.doGenerate({} as never);
    expect(collector.totals.calls).toBe(1);
    collector.reset();
    expect(collector.totals).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
  });

  it('wrap 保持模型身份字段（provider/modelId/specificationVersion）', () => {
    const collector = createUsageCollector();
    const wrapped = collector.wrap(createScriptedModel([{ type: 'text', text: 'x' }]));
    expect(wrapped.provider).toBe('job-helper-eval');
    expect(wrapped.modelId).toBe('scripted');
    expect(wrapped.specificationVersion).toBe('v4');
  });
});
