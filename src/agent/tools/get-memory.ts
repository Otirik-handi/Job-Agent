import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { getMemoryBlock, listMemoryBlocks, MEMORY_BLOCK_LABELS } from '../../db/repositories/memory-blocks';

const inputSchema = z.object({
  label: z.enum(MEMORY_BLOCK_LABELS).optional().describe('记忆块 label：resume 简历画像 / preferences 用户偏好 / status_scratchpad 进度速记；缺省返回全部记忆块'),
});

/** 确定性只读工具（无 LLM 调用）：读取 Agent 记忆块（label 可选：单块或全部）。 */
export const getMemoryTool = createDomainTool({
  name: 'getMemory',
  description: '读取 Agent 记忆块：传 label 读取单块（resume 简历画像 / preferences 用户偏好 / status_scratchpad 投递进度速记），不传则读取全部。返回各块 label、value、description 与字符上限 limit。需要回忆历史事实（用户偏好、简历画像、投递进度）时先调用本工具，不要凭空猜测记忆内容。',
  inputSchema,
  progress: { start: '正在读取记忆…', done: '记忆读取完成' },
  execute: async (args) => {
    if (args.label) {
      const block = getMemoryBlock(args.label);
      return {
        count: block ? 1 : 0,
        blocks: block
          ? [{ label: block.label, value: block.value, description: block.description, limit: block.limit }]
          : [],
      };
    }
    const rows = listMemoryBlocks();
    return {
      count: rows.length,
      blocks: rows.map((r) => ({
        label: r.label, value: r.value, description: r.description, limit: r.limit,
      })),
    };
  },
});
