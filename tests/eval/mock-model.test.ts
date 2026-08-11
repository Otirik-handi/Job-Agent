import { describe, expect, it } from 'vitest';
import { createScriptedModel } from './mock-model';

describe('createScriptedModel', () => {
  it('按调用序号依次返回 tool-call 与 text，input 的 JSON 序列化', async () => {
    const model = createScriptedModel([
      { type: 'tool-call', toolName: 'listResumes', input: {} },
      { type: 'text', text: '完成' },
    ]);
    const r1 = await model.doGenerate({} as never);
    expect(r1.content[0]).toMatchObject({ type: 'tool-call', toolName: 'listResumes' });
    expect(r1.content[0].type === 'tool-call' && JSON.parse(r1.content[0].input)).toEqual({});
    expect(r1.finishReason.unified).toBe('tool-calls');
    const r2 = await model.doGenerate({} as never);
    expect(r2.content[0]).toMatchObject({ type: 'text', text: '完成' });
    expect(r2.finishReason.unified).toBe('stop');
  });

  it('脚本未覆盖的调用抛错（提示序号）', async () => {
    const model = createScriptedModel([{ type: 'text', text: '只有一条' }]);
    await model.doGenerate({} as never);
    await expect(model.doGenerate({} as never)).rejects.toThrow(/unexpected LLM call #2/);
  });

  it('input 占位符 $<toolName>.<field> 从历史 tool-result 解析', async () => {
    const model = createScriptedModel([
      { type: 'tool-call', toolName: 'importResume', input: { text: '简历' } },
      { type: 'tool-call', toolName: 'analyzeResume', input: { resumeId: '$importResume.resumeId' } },
    ]);
    // 模拟第二轮调用时消息历史中含 importResume 的 tool-result
    const messages = [
      {
        role: 'assistant' as const,
        content: [
          { type: 'tool-call' as const, toolCallId: 'call_1', toolName: 'importResume', input: '{"text":"简历"}' },
        ],
      },
      {
        role: 'tool' as const,
        content: [
          {
            type: 'tool-result' as const, toolCallId: 'call_1', toolName: 'importResume',
            output: { ok: true, resumeId: 'resume-abc', name: '简历' }, isError: false,
          },
        ],
      },
    ];
    await model.doGenerate({} as never);
    const r2 = await model.doGenerate({ messages } as never);
    expect(r2.content[0].type === 'tool-call' && JSON.parse(r2.content[0].input)).toEqual({ resumeId: 'resume-abc' });
  });

  it('doStream 与 doGenerate 内容一致（tool-call / text / finish 分部）', async () => {
    const model = createScriptedModel([
      { type: 'tool-call', toolName: 'listResumes', input: {} },
      { type: 'text', text: '完成' },
    ]);
    const s1 = await model.doStream({} as never);
    const parts1: unknown[] = [];
    // tsconfig lib 不含 ReadableStream 的异步迭代声明（运行时正常），仅加类型断言
    for await (const p of s1.stream as unknown as AsyncIterable<unknown>) parts1.push(p);
    expect(parts1).toEqual([
      expect.objectContaining({ type: 'tool-input-start', toolName: 'listResumes' }),
      expect.objectContaining({ type: 'tool-input-end' }),
      expect.objectContaining({ type: 'tool-call', toolName: 'listResumes' }),
      expect.objectContaining({ type: 'finish' }),
    ]);
  });
});
