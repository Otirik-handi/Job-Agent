import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';

export type MockResponse =
  | { type: 'tool-call'; toolName: string; input: Record<string, unknown> }
  | { type: 'text'; text: string };

type ToolResultRecord = { toolName: string; output: Record<string, unknown> };

/**
 * 从消息历史提取最近的 tool-result 输出（供占位符解析）。
 * output 有两种形态：真实 SDK 的 v4 prompt 里是 { type: 'json'|'text', value } 封装，
 * 场景/单测契约直接放结果对象；两者都兼容。
 */
function extractToolResults(messages: unknown[]): ToolResultRecord[] {
  const results: ToolResultRecord[] = [];
  for (const m of messages as Array<{ role?: string; content?: unknown }>) {
    if (m.role !== 'tool' || !Array.isArray(m.content)) continue;
    for (const part of m.content as Array<{ type?: string; toolName?: string; output?: unknown }>) {
      if (part.type !== 'tool-result' || !part.toolName) continue;
      const raw = part.output;
      if (!raw || typeof raw !== 'object') continue;
      const wrapped = raw as { type?: string; value?: unknown };
      const record = wrapped.type === 'json' || wrapped.type === 'text' ? wrapped.value : raw;
      if (record && typeof record === 'object') {
        results.push({ toolName: part.toolName, output: record as Record<string, unknown> });
      }
    }
  }
  return results;
}

/** 占位符 $<toolName>.<field>：取最近一次该工具结果的字段值；找不到则抛错（场景脚本 bug） */
function resolvePlaceholderValue(toolName: string, field: string, results: ToolResultRecord[]): unknown {
  const hit = [...results].reverse().find((r) => r.toolName === toolName);
  if (!hit) throw new Error(`占位符 $${toolName}.${field} 无法解析：历史中没有 ${toolName} 的工具结果`);
  const value = hit.output[field];
  if (value === undefined) throw new Error(`占位符 $${toolName}.${field} 无法解析：${toolName} 结果中无 ${field} 字段`);
  return value;
}

/**
 * 占位符以字符串形式写在 input 值里，JSON 序列化后带引号；
 * 因此把整个带引号的 token 替换为 JSON 字面量，才能保持字段原始类型（字符串不加引号会双重引号导致 JSON 非法）。
 * 再兜底一次裸 token（未带引号），保证两种写法都覆盖。
 */
function resolvePlaceholders(input: Record<string, unknown>, results: ToolResultRecord[]): string {
  const json = JSON.stringify(input);
  return json
    .replace(/"\$([a-zA-Z][a-zA-Z0-9]*)\.([a-zA-Z][a-zA-Z0-9]*)"/g, (_, toolName: string, field: string) =>
      JSON.stringify(resolvePlaceholderValue(toolName, field, results)),
    )
    .replace(/\$([a-zA-Z][a-zA-Z0-9]*)\.([a-zA-Z][a-zA-Z0-9]*)/g, (_, toolName: string, field: string) =>
      JSON.stringify(resolvePlaceholderValue(toolName, field, results)),
    );
}

/**
 * scripted LanguageModel：按调用序号返回预设响应（跨轮全局累计）。
 * - tool-call 的 input 支持占位符 $<toolName>.<field>（运行时 id 从历史 tool-result 解析）
 * - 脚本未覆盖的调用抛错（unexpected LLM call），保证 mock 层完全确定性
 * - doStream 与 doGenerate 内容一致（共用序号与生成逻辑，doStream 不额外消耗序号）
 */
export function createScriptedModel(script: MockResponse[]): LanguageModelV4 {
  let calls = 0;
  // 假用量：SDK 只要求形状合法，评测不关心数值
  const usage: LanguageModelV4GenerateResult['usage'] = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };

  async function generateOnce(params: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
    const response = script[calls];
    if (!response) {
      throw new Error(
        `unexpected LLM call #${calls + 1}：mock 脚本未覆盖（共 ${script.length} 条）。场景 mockScript 需补足该调用；注意工具内部 callStructured 调用也计入序号。`,
      );
    }
    calls += 1;
    if (response.type === 'text') {
      return {
        content: [{ type: 'text' as const, text: response.text }],
        finishReason: { unified: 'stop' as const, raw: undefined },
        usage,
        warnings: [],
      };
    }
    // v4 call options 的字段是 prompt（SDK 实际传入），场景/单测契约按 messages 构造，两者都读
    const rawMessages = params.prompt ?? (params as { messages?: unknown[] }).messages ?? [];
    const results = extractToolResults(rawMessages as unknown[]);
    const input = resolvePlaceholders(response.input, results);
    return {
      content: [{ type: 'tool-call' as const, toolCallId: `call_${calls}`, toolName: response.toolName, input }],
      finishReason: { unified: 'tool-calls' as const, raw: undefined },
      usage,
      warnings: [],
    };
  }

  return {
    specificationVersion: 'v4',
    provider: 'job-helper-eval',
    modelId: 'scripted',
    supportedUrls: {},
    doGenerate: generateOnce,
    async doStream(params) {
      const generated = await generateOnce(params);
      const parts: LanguageModelV4StreamPart[] = [];
      for (const c of generated.content) {
        if (c.type === 'text') {
          parts.push({ type: 'text-start', id: `t${calls}` });
          parts.push({ type: 'text-delta', id: `t${calls}`, delta: c.text });
          parts.push({ type: 'text-end', id: `t${calls}` });
        } else if (c.type === 'tool-call') {
          parts.push({ type: 'tool-input-start', id: c.toolCallId, toolName: c.toolName });
          parts.push({ type: 'tool-input-end', id: c.toolCallId });
          parts.push({ type: 'tool-call', toolCallId: c.toolCallId, toolName: c.toolName, input: c.input });
        }
      }
      parts.push({ type: 'finish', usage: generated.usage, finishReason: generated.finishReason });
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const p of parts) controller.enqueue(p);
            controller.close();
          },
        }),
      };
    },
  };
}
