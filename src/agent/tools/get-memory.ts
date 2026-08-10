import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { getMemoryBlock, listMemoryBlocks, MEMORY_BLOCK_LABELS } from '../../db/repositories/memory-blocks';

const inputSchema = z.object({
  label: z.enum(MEMORY_BLOCK_LABELS).optional().describe('记忆块 label：resume 简历画像 / preferences 用户偏好 / status_scratchpad 进度速记；缺省返回全部记忆块'),
});

/** 确定性只读工具（无 LLM 调用）：读取 Agent 记忆块（label 可选：单块或全部）。 */
export const getMemoryTool = createDomainTool({
  name: 'getMemory',
  description: '读取 Agent 持久记忆：传 label 读取单块，不传则读取全部记忆块。参数 label 可选，取值 resume（简历画像）/ preferences（用户偏好）/ status_scratchpad（投递进度速记），缺省返回全部。需要回忆历史事实（用户偏好、简历画像、投递进度）时先调用本工具，记忆内容一律以返回为准，不臆测不编造；只读无副作用。返回 ok、count 与各记忆块（label、value、description、字符上限 limit）。',
  inputSchema,
  progress: { start: '正在读取记忆…', done: '记忆读取完成' },
  execute: async (args) => {
    if (args.label) {
      const block = getMemoryBlock(args.label);
      return {
        ok: true,
        count: block ? 1 : 0,
        blocks: block
          ? [{ label: block.label, value: block.value, description: block.description, limit: block.limit }]
          : [],
      };
    }
    const rows = listMemoryBlocks();
    return {
      ok: true,
      count: rows.length,
      blocks: rows.map((r) => ({
        label: r.label, value: r.value, description: r.description, limit: r.limit,
      })),
    };
  },
});
