import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { MEMORY_BLOCK_LABELS, setMemoryBlock } from '../../db/repositories/memory-blocks';

const inputSchema = z.object({
  label: z.enum(MEMORY_BLOCK_LABELS).describe('记忆块 label：resume 简历画像 / preferences 用户偏好 / status_scratchpad 进度速记'),
  value: z.string().min(1).describe('要写入的记忆内容（受各块字符上限 limit 约束，超限将报错，需精简后重写）'),
});

/**
 * 确定性写入工具（无 LLM 调用）：写入/更新 Agent 记忆块（按 label upsert）。
 * 仅记录用户显式声明的偏好/事实；写入前须在对话中向用户复述将写入的内容并请求确认。
 */
export const setMemoryTool = createDomainTool({
  name: 'setMemory',
  description: '写入/更新 Agent 持久记忆：按 label 覆盖写入对应记忆块。参数 label 为记忆块（resume 简历画像 / preferences 用户偏好 / status_scratchpad 投递进度速记），value 为要写入的内容（受各块字符上限 limit 约束，超限报错需精简后重写）。仅当用户显式声明偏好或事实时使用，写入前须在对话中向用户复述将写入的内容并请求确认，确认后再调用；不得推断或补全用户未表达的内容。返回写入后的记忆块（label、value、limit、updatedAt）。',
  inputSchema,
  progress: { start: '正在写入记忆…', done: '记忆写入完成' },
  execute: async (args) => {
    const record = setMemoryBlock(args.label, args.value);
    return {
      label: record.label,
      value: record.value,
      limit: record.limit,
      updatedAt: record.updatedAt,
    };
  },
});
