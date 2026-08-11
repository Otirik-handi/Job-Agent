import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../index';
import { lessons } from '../schema';
import { nowIso } from './shared';

/** 教训分类枚举（新增分类必须先更新 .agents/specs/02-backend/api-data-conventions.md「lessons 表」再落库） */
export const LESSON_CATEGORIES = [
  'matching',
  'marketing',
  'interview',
  'application',
  'tooling',
  'general',
] as const;
export type LessonCategory = (typeof LESSON_CATEGORIES)[number];

/** trigram tokenizer 下查询词最短长度：<3 字符（含中文单字/双字）无法切出 trigram，MATCH 必不命中 */
export const LESSON_FTS_MIN_QUERY_LENGTH = 3;

/** 列表/检索单次返回上限（教训按需取回，不常驻上下文） */
export const LESSON_DEFAULT_LIMIT = 20;

export type LessonRecord = {
  id: string; content: string; category: string; sourceTaskId: string | null; createdAt: string;
};

/** 事务内写 lessons + lessons_fts（content 为索引内容，id/category 为 UNINDEXED 存储列供生命周期同步与过滤） */
export function insertLesson(input: { content: string; category: string; sourceTaskId?: string | null }): LessonRecord {
  const { content, category, sourceTaskId = null } = input;
  if (!LESSON_CATEGORIES.includes(category as LessonCategory)) {
    // 工具层 zod enum 已拦截非法分类，此处为仓储层双保险（防御绕过工具的直连写入）
    throw new Error(`非法教训分类：${category}`);
  }
  const record: LessonRecord = { id: randomUUID(), content, category, sourceTaskId, createdAt: nowIso() };
  db.transaction((tx) => {
    tx.insert(lessons).values(record).run();
    tx.run(sql`
      INSERT INTO lessons_fts (content, id, category)
      VALUES (${record.content}, ${record.id}, ${record.category})
    `);
  });
  return record;
}

/** 按时间倒序返回最近 N 条（无 query 检索路径，供 searchLessons 降级与工具无 query 调用） */
export function listLessons({ category, limit = LESSON_DEFAULT_LIMIT }: { category?: string; limit?: number } = {}): LessonRecord[] {
  const conditions: SQL[] = [];
  if (category) conditions.push(eq(lessons.category, category));
  const query = db.select().from(lessons);
  const rows = conditions.length > 0 ? query.where(and(...conditions)) : query;
  return rows.orderBy(desc(lessons.createdAt), desc(sql`rowid`)).limit(limit).all();
}

/** FTS MATCH 检索（trigram）：查询为空/过短（<3 字符）时不命中，降级为按时间倒序列表 */
export function searchLessons(query: string, { category, limit = LESSON_DEFAULT_LIMIT }: { category?: string; limit?: number } = {}): LessonRecord[] {
  const normalized = query.trim();
  if (normalized.length < LESSON_FTS_MIN_QUERY_LENGTH) {
    return listLessons({ category, limit });
  }
  const conditions: SQL[] = [
    sql`${lessons.id} IN (SELECT id FROM lessons_fts WHERE lessons_fts MATCH ${normalized})`,
  ];
  if (category) conditions.push(eq(lessons.category, category));
  return db.select().from(lessons)
    .where(and(...conditions))
    .orderBy(desc(lessons.createdAt), desc(sql`rowid`))
    .limit(limit)
    .all();
}

/** 按来源任务（如计划 taskId）删除教训并同步删除对应 FTS 行（清理联动/测试清理用） */
export function deleteLessonsBySourceTask(sourceTaskId: string): void {
  db.transaction((tx) => {
    const rows = tx.select({ id: lessons.id }).from(lessons).where(eq(lessons.sourceTaskId, sourceTaskId)).all();
    tx.delete(lessons).where(eq(lessons.sourceTaskId, sourceTaskId)).run();
    if (rows.length > 0) {
      const idParams = rows.map((r) => sql`${r.id}`);
      tx.run(sql`DELETE FROM lessons_fts WHERE id IN (${sql.join(idParams, sql`, `)})`);
    }
  });
}
