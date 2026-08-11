import type { MemoryBlockRecord } from '@/src/db/repositories/memory-blocks';
import { SYSTEM_PROMPT } from './agent';
import { listSkillMetadata } from './skills';

export type MemoryBlock = MemoryBlockRecord;

/**
 * 组装分层 system prompt：基础 SYSTEM_PROMPT + 「当前记忆」段 + 「Skill 技能库」段 + 「当前会话状态」段。
 *
 * - 记忆段：逐块输出 `[label] description：value`；某块 value 为空时输出占位说明「未记录」。
 * - Skill 段：遍历 skills/ 目录注入每个 skill 的 name + description（元数据常驻、正文按需）；
 *   无 skill 时输出「（暂无技能库）」。
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

  const skillLines = listSkillMetadata().map((skill) => `- ${skill.name}：${skill.description}`);
  const skillSection = `Skill 技能库：\n${skillLines.length > 0 ? skillLines.join('\n') : '- （暂无技能库）'}`;

  const stateSection = sessionState && sessionState.trim()
    ? `当前会话状态（JSON）：\n${sessionState}`
    : '当前会话状态（JSON）：\n- 无进行中的会话状态';

  return [SYSTEM_PROMPT, memorySection, skillSection, stateSection].join('\n\n');
}
