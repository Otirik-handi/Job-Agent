/** searchMessages：语义检索历史对话（按含义匹配，不要求字面一致），只读免确认 */
import { z } from 'zod';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../db';
import { messages } from '../../db/schema';
import { createDomainTool } from '../tool-factory';
import { embedText } from '../embedding';
import { searchVectors } from '../vector-search';

const inputSchema = z.strictObject({
  query: z.string().min(1).max(200).describe('语义检索词（回忆之前提过的偏好/进度/信息）'),
  limit: z.number().int().min(1).max(20).optional().describe('返回条数上限，默认 5'),
  conversationId: z.string().optional().describe('限定会话检索（可选）'),
});

type MessageRow = { id: string; conversationId: string; role: string; messageJson: string; embeddingJson: string | null };

/** 消息文本摘要：text parts 拼接截断 200 字符 */
function summarizeText(messageJson: string): string {
  try {
    const msg = JSON.parse(messageJson) as { parts?: Array<{ type?: string; text?: string }> };
    const text = (msg.parts ?? [])
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 200);
  } catch {
    return '';
  }
}

export const searchMessagesTool = createDomainTool({
  name: 'searchMessages',
  description: '语义检索历史对话：按含义匹配（不要求字面一致），回忆之前提过的偏好/进度/岗位信息。参数 query 为检索词（1-200 字符）、limit 条数（1-20 默认 5）、conversationId 可选限定会话。只检索已嵌入的消息——未嵌入的存量消息需先跑 npm run embed-backfill；需要字面精确检索的场景不适用。返回 ok、count 与 results（messageId、conversationId、role、text 摘要 200 字符、score 余弦相似度）。',
  inputSchema,
  progress: { start: '正在检索历史对话…', done: '检索完成' },
  execute: async (args) => {
    const queryVec = await embedText(args.query);
    if (!queryVec) {
      return {
        ok: false,
        error: {
          code: 'EMBEDDING_FAILED',
          message: '查询向量生成失败（embedding 未配置或 API 不可用）',
          hint: '请确认已配置 EMBEDDING_BASE_URL/EMBEDDING_API_KEY/EMBEDDING_MODEL（硅基流动）；或稍后重试。',
        },
      };
    }
    // 全表加载有向量的消息（数据量小，内存计算）；where 只能调用一次（drizzle 类型限制），条件用 and 组合
    const rows = db.select({
      id: messages.id, conversationId: messages.conversationId, role: messages.role,
      messageJson: messages.messageJson, embeddingJson: messages.embeddingJson,
    }).from(messages)
      .where(and(isNotNull(messages.embeddingJson), args.conversationId ? eq(messages.conversationId, args.conversationId) : undefined))
      .all() as MessageRow[];
    const withVec = rows
      .map((r) => {
        try {
          const vec = JSON.parse(r.embeddingJson!) as unknown;
          return Array.isArray(vec) && vec.every((n) => typeof n === 'number')
            ? { ...r, vector: vec as number[] } : null;
        } catch { return null; }
      })
      .filter((x): x is MessageRow & { vector: number[] } => x !== null);
    const top = searchVectors(queryVec, withVec, args.limit ?? 5);
    return {
      ok: true,
      query: args.query,
      count: top.length,
      results: top.map(({ row, score }) => ({
        messageId: row.id,
        conversationId: row.conversationId,
        role: row.role,
        text: summarizeText(row.messageJson),
        score,
      })),
    };
  },
});
