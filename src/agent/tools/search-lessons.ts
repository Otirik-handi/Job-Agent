import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { LESSON_CATEGORIES, listLessons, searchLessons } from '../../db/repositories/lessons';

const inputSchema = z.strictObject({
  query: z.string().min(1).optional().describe('检索词（≥3 字符命中更准，过短自动降级为最近教训列表）'),
  category: z.enum(LESSON_CATEGORIES).optional().describe('按分类过滤：matching / marketing / interview / application / tooling / general'),
  limit: z.number().int().min(1).max(20).optional().describe('返回条数上限，默认 5，最大 20'),
});

/**
 * 确定性只读工具（无 LLM 调用）：按需检索历史教训（教训不常驻上下文，用前查、用后即弃）。
 * 有 query 走 lessons_fts 全文检索，无 query 按时间倒序返回最近 N 条；无匹配返回空列表（非错误）。
 */
export const searchLessonsTool = createDomainTool({
  name: 'searchLessons',
  description: '检索历史教训：按关键词或分类取回之前沉淀的失败复盘/经验（教训不常驻上下文，需要时按需检索）。参数 query 为检索词（≥3 字符命中更准，过短自动降级为最近教训），category 可选按分类过滤，limit 可选条数（默认 5，最大 20）。新任务开始或再次失败前调用以复用经验；教训内容本身在用户偏好/进度里（那应查 getMemory）。无匹配时返回空列表（count 为 0，非错误）。返回 ok、count 与教训列表（id、content、category、sourceTaskId、createdAt）。',
  inputSchema,
  progress: { start: '正在检索教训…', done: '教训检索完成' },
  execute: async (args) => {
    const limit = args.limit ?? 5;
    const category = args.category;
    const records = args.query
      ? searchLessons(args.query, { category, limit })
      : listLessons({ category, limit });
    return {
      ok: true,
      count: records.length,
      lessons: records.map((r) => ({
        id: r.id,
        content: r.content,
        category: r.category,
        sourceTaskId: r.sourceTaskId,
        createdAt: r.createdAt,
      })),
    };
  },
});
