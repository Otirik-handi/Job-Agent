import type { MemoryBlockRecord } from '@/src/db/repositories/memory-blocks';
import { SYSTEM_PROMPT } from './agent';

export type MemoryBlock = MemoryBlockRecord;

/**
 * 组装分层 system prompt：基础 SYSTEM_PROMPT + 「当前记忆」段 + 「当前会话状态」段。
 *
 * - 记忆段：逐块输出 `[label] description：value`；某块 value 为空时输出占位说明「未记录」。
 * - 会话状态段：sessionState 非空时输出 stateJson 原文；为空输出「无进行中的会话状态」。
 *
 * 注意：value 为用户的敏感数据，本函数只负责字符串拼接；日志/错误输出层面的
 * 脱敏不在此函数职责内，由调用方保证不将完整 prompt 打入日志。
 */
export function buildSystemPrompt(options: { memoryBlocks: MemoryBlock[]; sessionState: string | null }): string {
  const { memoryBlocks, sessionState } = options;

  const memoryLines = memoryBlocks.map((block) => {
    const value = block.value.trim();
    const display = value ? value : '未记录';
    return `- [${block.label}] ${block.description}：${display}`;
  });
  const memorySection = `当前记忆：\n${memoryLines.length > 0 ? memoryLines.join('\n') : '- （暂无记忆内容）'}`;

  const stateSection = sessionState && sessionState.trim()
    ? `当前会话状态（JSON）：\n${sessionState}`
    : '当前会话状态（JSON）：\n- 无进行中的会话状态';

  return [SYSTEM_PROMPT, memorySection, stateSection].join('\n\n');
}
