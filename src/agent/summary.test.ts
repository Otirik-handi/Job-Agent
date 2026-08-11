import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UIMessage } from 'ai';
import type { MessageRecord } from '@/src/db/repositories/messages';
import {
  MAX_HISTORY_ROUNDS,
  extractConversationTranscript,
  generateConversationSummary,
  maybeGenerateSummary,
} from './summary';

vi.mock('./model', () => ({ getModel: vi.fn(() => ({})) }));
vi.mock('./llm-call', () => ({ callStructured: vi.fn() }));
vi.mock('@/src/db/repositories/conversations', () => ({
  getConversationSummary: vi.fn(),
  setConversationSummary: vi.fn(),
}));

import { callStructured } from './llm-call';
import { getConversationSummary, setConversationSummary } from '@/src/db/repositories/conversations';

const mockCallStructured = vi.mocked(callStructured);
const mockGetSummary = vi.mocked(getConversationSummary);
const mockSetSummary = vi.mocked(setConversationSummary);

function textMessage(id: string, role: 'user' | 'assistant', text: string): UIMessage {
  return { id, role, parts: [{ type: 'text', text }] };
}

function record(id: string, message: UIMessage): MessageRecord {
  return {
    id,
    conversationId: 'conv-1',
    role: message.role,
    messageJson: JSON.stringify(message),
    createdAt: `2026-01-01T00:00:00.${id.padStart(3, '0')}Z`,
  };
}

/** 构造 n 条历史记录：第 i 条文本为「消息{i}」 */
function historyOf(n: number): MessageRecord[] {
  const records: MessageRecord[] = [];
  for (let i = 0; i < n; i++) {
    records.push(record(`m${i}`, textMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `消息${i}`)));
  }
  return records;
}

beforeEach(() => {
  mockCallStructured.mockReset();
  mockGetSummary.mockReset();
  mockSetSummary.mockReset();
  mockGetSummary.mockReturnValue(null);
});

describe('extractConversationTranscript（纯文本提取与入参裁剪）', () => {
  it('只提取文本 parts，按角色标注，跳过工具等非文本 parts', () => {
    const toolPart = { type: 'tool-invocation', toolInvocation: {} } as never;
    const messages: UIMessage[] = [
      {
        id: 'u1', role: 'user',
        parts: [{ type: 'text', text: '帮我分析简历' }, toolPart],
      },
      {
        id: 'a1', role: 'assistant',
        parts: [{ type: 'text', text: '好的，请稍等' }, toolPart],
      },
    ];
    const transcript = extractConversationTranscript(messages);
    expect(transcript).toBe('用户：帮我分析简历\n\n助手：好的，请稍等');
    expect(transcript).not.toContain('tool-invocation');
  });

  it('全部无文本 parts 时返回空串', () => {
    const transcript = extractConversationTranscript([{ id: 't1', role: 'assistant', parts: [] }]);
    expect(transcript).toBe('');
  });

  it('未超限时原样返回（含多段文本拼接）', () => {
    const messages: UIMessage[] = [{
      id: 'u1', role: 'user',
      parts: [{ type: 'text', text: '第一段' }, { type: 'text', text: '第二段' }],
    }];
    expect(extractConversationTranscript(messages)).toBe('用户：第一段\n第二段');
  });

  it('超限时头尾采样：保留开头与结尾、中间以省略标记截断，总长受控', () => {
    const maxChars = 100;
    const head = '甲'.repeat(80);
    const mid = '乙'.repeat(100);
    const tail = '丙'.repeat(80);
    const messages: UIMessage[] = [
      textMessage('h', 'user', head),
      textMessage('m', 'assistant', mid),
      textMessage('t', 'user', tail),
    ];
    const transcript = extractConversationTranscript(messages, maxChars);
    expect(transcript.length).toBeLessThanOrEqual(maxChars);
    expect(transcript).toContain('…（中间部分省略）…');
    expect(transcript.startsWith('用户：' + head.slice(0, 5))).toBe(true);
    expect(transcript.endsWith(tail.slice(-5))).toBe(true);
    expect(transcript).not.toContain(mid);
  });
});

describe('generateConversationSummary（LLM 生成与失败降级）', () => {
  it('callStructured 成功返回结构化结果', async () => {
    mockCallStructured.mockResolvedValueOnce({
      ok: true,
      data: { summary: '用户偏向后端岗位，已投递 A 公司', hasPending: true },
    });
    const result = await generateConversationSummary([textMessage('u1', 'user', '我偏好后端')]);
    expect(result).toEqual({ summary: '用户偏向后端岗位，已投递 A 公司', hasPending: true });
    expect(mockCallStructured).toHaveBeenCalledTimes(1);
  });

  it('callStructured 失败（ok:false）返回 null', async () => {
    mockCallStructured.mockResolvedValueOnce({
      ok: false,
      error: { code: 'LLM_OUTPUT_INVALID', message: '结构化输出校验失败' },
    });
    const result = await generateConversationSummary([textMessage('u1', 'user', '你好')]);
    expect(result).toBeNull();
  });

  it('callStructured 抛异常（如模型未配置）返回 null 且不抛错', async () => {
    mockCallStructured.mockRejectedValueOnce(new Error('LLM 环境变量缺失'));
    await expect(generateConversationSummary([textMessage('u1', 'user', '你好')])).resolves.toBeNull();
  });
});

describe('maybeGenerateSummary（触发条件与编排）', () => {
  it('summary 已存在：直接返回常驻摘要，不重复触发生成', async () => {
    mockGetSummary.mockReturnValue('常驻摘要');
    const result = await maybeGenerateSummary('conv-1', historyOf(30));
    expect(result).toBe('常驻摘要');
    expect(mockCallStructured).not.toHaveBeenCalled();
    expect(mockSetSummary).not.toHaveBeenCalled();
  });

  it('未达截断点（≤ MAX_HISTORY_ROUNDS*2 条）：不触发，返回 null', async () => {
    const result = await maybeGenerateSummary('conv-1', historyOf(MAX_HISTORY_ROUNDS * 2));
    expect(result).toBeNull();
    expect(mockCallStructured).not.toHaveBeenCalled();
    expect(mockSetSummary).not.toHaveBeenCalled();
  });

  it('首次截断：取将被截断的旧轮生成摘要，成功则落库并返回', async () => {
    const records = historyOf(MAX_HISTORY_ROUNDS * 2 + 1); // 25 条：最旧 1 条将被截断
    mockCallStructured.mockResolvedValueOnce({
      ok: true,
      data: { summary: '旧轮摘要', hasPending: false },
    });
    const result = await maybeGenerateSummary('conv-1', records);
    expect(result).toBe('旧轮摘要');
    // 入参只含被截断的最旧 1 条，不含最新消息
    expect(mockCallStructured).toHaveBeenCalledTimes(1);
    const userPrompt = mockCallStructured.mock.calls[0][0].userPrompt;
    expect(userPrompt).toContain('消息0');
    expect(userPrompt).not.toContain(`消息${records.length - 1}`);
    expect(mockSetSummary).toHaveBeenCalledWith('conv-1', '旧轮摘要');
  });

  it('生成失败（返回 null）：不落库、返回 null、不阻塞', async () => {
    mockCallStructured.mockResolvedValueOnce({
      ok: false,
      error: { code: 'LLM_CALL_FAILED', message: '模型调用失败' },
    });
    const result = await maybeGenerateSummary('conv-1', historyOf(MAX_HISTORY_ROUNDS * 2 + 2));
    expect(result).toBeNull();
    expect(mockSetSummary).not.toHaveBeenCalled();
  });

  it('仓储读取异常：降级返回 null 且不抛错', async () => {
    mockGetSummary.mockImplementation(() => { throw new Error('db error'); });
    await expect(maybeGenerateSummary('conv-1', historyOf(MAX_HISTORY_ROUNDS * 2 + 2))).resolves.toBeNull();
  });

  it('被截断消息全部 JSON 损坏：跳过解析，返回 null 不触发 LLM', async () => {
    const records = historyOf(MAX_HISTORY_ROUNDS * 2 + 1);
    records[0] = { ...records[0], messageJson: '{broken' };
    const result = await maybeGenerateSummary('conv-1', records);
    expect(result).toBeNull();
    expect(mockCallStructured).not.toHaveBeenCalled();
  });
});
