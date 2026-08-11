import type { UIMessage } from 'ai';
import { z } from 'zod';
import { getModel } from './model';
import { callStructured } from './llm-call';
import { buildSessionSummarySystemPrompt, buildSessionSummaryUserPrompt } from './prompts/session-summary';
import type { MessageRecord } from '@/src/db/repositories/messages';
import { getConversationSummary, setConversationSummary } from '@/src/db/repositories/conversations';

/**
 * 会话级摘要（规范见 02-backend「会话摘要」）：
 * - 会话消息数首次达到轮数上限（MAX_HISTORY_ROUNDS=12 截断点）时，对将被截断的旧轮由 LLM 生成一次摘要，
 *   写入 conversations.summary，此后常驻注入；summary 非空后不再重复生成。
 * - 生成失败降级：摘要链路任何异常都不抛错、不落日志（消息文本为敏感数据），返回 null，不阻塞主流程。
 * - 与记忆层边界：summary = 对话上下文的压缩（过程性内容、未决事项）；memory_blocks = 结构化事实。两者不混用。
 */

/** 截断点：仅保留最近 N 轮（每轮一条用户消息 + 一条助手消息） */
export const MAX_HISTORY_ROUNDS = 12;

/** 摘要生成入参文本上限（字符）；超限按头尾采样，避免单次请求消耗过大 token */
export const MAX_SUMMARY_INPUT_CHARS = 8000;

/** 生成失败降级：返回 null（不抛错） */
export type ConversationSummaryResult = { summary: string; hasPending: boolean };

export const conversationSummarySchema = z.object({
  summary: z.string().min(1).describe('压缩摘要文本（中文，忠于原文，≤400 字）'),
  hasPending: z.boolean().describe('是否存在未决事项或进行中任务'),
});

/**
 * 从 UIMessage 列表提取纯文本转录（角色标签 + 文本 parts，丢弃工具调用/结果等非文本部分），
 * 供摘要生成入参。总长超过 maxChars 时头尾采样（保留开头早期决策与结尾最近进度，中间省略），
 * 保证入参长度受控。
 */
export function extractConversationTranscript(oldMessages: UIMessage[], maxChars = MAX_SUMMARY_INPUT_CHARS): string {
  const lines = oldMessages
    .map((m) => {
      const text = m.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n')
        .trim();
      if (!text) return '';
      const label = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : m.role;
      return `${label}：${text}`;
    })
    .filter((l) => l.length > 0);
  const full = lines.join('\n\n');
  if (full.length <= maxChars) return full;
  const marker = '…（中间部分省略）…';
  const joinerLength = 2; // 采样拼接中 marker 前后各一个换行
  const bodyLength = Math.max(0, maxChars - marker.length - joinerLength);
  const headLen = Math.floor(bodyLength * 0.3);
  const tailLen = bodyLength - headLen;
  return `${full.slice(0, headLen)}\n${marker}\n${full.slice(-tailLen)}`;
}

/**
 * 对将被截断的旧消息生成会话摘要（经 callStructured 通道调用 LLM）。
 * 生成失败（含模型未配置）一律返回 null 降级，不抛错。
 */
export async function generateConversationSummary(oldMessages: UIMessage[]): Promise<ConversationSummaryResult | null> {
  try {
    const result = await callStructured({
      model: getModel(),
      systemPrompt: buildSessionSummarySystemPrompt(),
      userPrompt: buildSessionSummaryUserPrompt(extractConversationTranscript(oldMessages)),
      schema: conversationSummarySchema,
      task: 'session-summary',
    });
    return result.ok ? result.data : null;
  } catch {
    // 降级：摘要生成失败不影响主流程；消息文本为敏感数据，不写入日志
    return null;
  }
}

/**
 * 触发与注入编排：返回本次请求应注入的摘要文本（无则为 null）。
 * - summary 已存在：直接返回常驻摘要（只生成一次，不重复触发）。
 * - 未达截断点（historyRecords ≤ MAX_HISTORY_ROUNDS * 2）：返回 null。
 * - 首次截断：取将被截断的旧轮（最旧的 historyRecords.length - MAX_HISTORY_ROUNDS * 2 条）生成摘要，
 *   成功则落库并返回；失败/异常降级返回 null，不阻塞请求。
 */
export async function maybeGenerateSummary(conversationId: string, historyRecords: MessageRecord[]): Promise<string | null> {
  try {
    const existing = getConversationSummary(conversationId);
    if (existing) return existing;

    if (historyRecords.length <= MAX_HISTORY_ROUNDS * 2) return null;

    const oldRecords = historyRecords.slice(0, historyRecords.length - MAX_HISTORY_ROUNDS * 2);
    const oldMessages: UIMessage[] = [];
    for (const record of oldRecords) {
      try {
        const parsed = JSON.parse(record.messageJson) as UIMessage;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.parts)) {
          oldMessages.push(parsed);
        }
      } catch {
        // 单条消息 JSON 损坏则跳过，不阻断整体摘要
      }
    }
    if (oldMessages.length === 0) return null;

    const result = await generateConversationSummary(oldMessages);
    if (!result) return null;

    setConversationSummary(conversationId, result.summary);
    return result.summary;
  } catch {
    // 降级：摘要链路（含仓储）异常不阻塞主流程；不落日志（消息文本为敏感数据）
    return null;
  }
}
