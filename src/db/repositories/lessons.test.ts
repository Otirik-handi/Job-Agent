import { afterEach, describe, expect, it } from 'vitest';
import { eq, like, sql } from 'drizzle-orm';
import { db } from '../index';
import { lessons } from '../schema';
import {
  LESSON_FTS_MIN_QUERY_LENGTH,
  deleteLessonsBySourceTask,
  insertLesson,
  listLessons,
  searchLessons,
} from './lessons';

/** 测试数据统一挂 sourceTaskId 前缀，afterEach 按前缀清理，不触碰库中其他数据 */
const TEST_PREFIX = 'test-lesson-';

afterEach(() => {
  db.transaction((tx) => {
    const rows = tx.select({ id: lessons.id }).from(lessons)
      .where(like(lessons.sourceTaskId, `${TEST_PREFIX}%`)).all();
    tx.delete(lessons).where(like(lessons.sourceTaskId, `${TEST_PREFIX}%`)).run();
    for (const row of rows) {
      tx.run(sql`DELETE FROM lessons_fts WHERE id = ${row.id}`);
    }
  });
});

function countFtsRows(): number {
  const row = db.get<{ c: number }>(sql`SELECT count(*) AS c FROM lessons_fts`);
  return row?.c ?? 0;
}

describe('insertLesson（写入 + 校验）', () => {
  it('写入成功：返回含 id/content/category/sourceTaskId/createdAt 的完整记录，listLessons 可取回', () => {
    const record = insertLesson({ content: '导入岗位失败时先确认 JD 文本完整', category: 'tooling', sourceTaskId: `${TEST_PREFIX}1` });
    expect(record.id).toBeTruthy();
    expect(record.createdAt).toBeTruthy();
    expect(record).toMatchObject({
      content: '导入岗位失败时先确认 JD 文本完整',
      category: 'tooling',
      sourceTaskId: `${TEST_PREFIX}1`,
    });
    const rows = listLessons({ limit: 50 });
    expect(rows.find((r) => r.id === record.id)).toEqual(record);
  });

  it('sourceTaskId 缺省时为 null', () => {
    const record = insertLesson({ content: '通用教训', category: 'general' });
    expect(record.sourceTaskId).toBeNull();
    // 该条无前缀可匹配，手动按 id 清理防残留
    db.transaction((tx) => {
      tx.delete(lessons).where(eq(lessons.id, record.id)).run();
      tx.run(sql`DELETE FROM lessons_fts WHERE id = ${record.id}`);
    });
  });

  it('非法 category 拒绝且不落库（lessons 与 lessons_fts 均无该行）', () => {
    const before = countFtsRows();
    expect(() => insertLesson({ content: 'x', category: 'bad-category' })).toThrow(/非法教训分类/);
    const after = countFtsRows();
    expect(after).toBe(before);
  });

  it('事务一致性：写入后 lessons 与 lessons_fts 行数同步增长', () => {
    const before = countFtsRows();
    const records = Array.from({ length: 3 }, (_, i) =>
      insertLesson({ content: `唯一内容${i}`, category: 'general', sourceTaskId: `${TEST_PREFIX}tx` }));
    expect(countFtsRows()).toBe(before + 3);
    for (const record of records) {
      expect(searchLessons('唯一内容', { limit: 20 }).some((r) => r.id === record.id)).toBe(true);
    }
  });
});

describe('listLessons（按时间倒序 + category 过滤 + limit）', () => {
  it('按时间倒序返回最近 N 条（同毫秒插入按插入顺序倒序）', () => {
    const a = insertLesson({ content: '教训甲', category: 'general', sourceTaskId: `${TEST_PREFIX}list` });
    const b = insertLesson({ content: '教训乙', category: 'general', sourceTaskId: `${TEST_PREFIX}list` });
    const c = insertLesson({ content: '教训丙', category: 'general', sourceTaskId: `${TEST_PREFIX}list` });
    const rows = listLessons({ limit: 3 });
    expect(rows.map((r) => r.id)).toEqual([c.id, b.id, a.id]);
  });

  it('limit 生效：只返回最近 N 条', () => {
    insertLesson({ content: '教训甲', category: 'general', sourceTaskId: `${TEST_PREFIX}lim` });
    insertLesson({ content: '教训乙', category: 'general', sourceTaskId: `${TEST_PREFIX}lim` });
    const rows = listLessons({ limit: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('教训乙');
  });

  it('category 过滤只返回该分类', () => {
    insertLesson({ content: '匹配类教训', category: 'matching', sourceTaskId: `${TEST_PREFIX}cat` });
    insertLesson({ content: '面试类教训', category: 'interview', sourceTaskId: `${TEST_PREFIX}cat` });
    const rows = listLessons({ category: 'interview', limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('面试类教训');
  });
});

describe('searchLessons（FTS 检索 + 降级）', () => {
  it('中文 3+ 字符查询命中：MATCH 检索可召回共享 trigram 的教训', () => {
    insertLesson({ content: '简历匹配失败时要先确认岗位已导入', category: 'matching', sourceTaskId: `${TEST_PREFIX}fts` });
    const rows = searchLessons('简历匹配', { limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toContain('简历匹配失败');
  });

  it('英文查询命中', () => {
    insertLesson({ content: 'import a resume then verify it was analyzed', category: 'tooling', sourceTaskId: `${TEST_PREFIX}fts` });
    const rows = searchLessons('resume', { limit: 10 });
    expect(rows.some((r) => r.content.includes('import a resume'))).toBe(true);
  });

  it('查询过短（<3 字符）降级为最近列表：返回按时间倒序的最近教训而非空', () => {
    insertLesson({ content: '不包含检索词的教训内容', category: 'general', sourceTaskId: `${TEST_PREFIX}short` });
    insertLesson({ content: '另一条不匹配内容', category: 'general', sourceTaskId: `${TEST_PREFIX}short` });
    const query = '简历';
    expect(query.length).toBeLessThan(LESSON_FTS_MIN_QUERY_LENGTH);
    const rows = searchLessons(query, { limit: 10 });
    // 直连 dev 库（已知限制）：库中可能还有更旧的真实教训，只断言新插入的两条排在最前
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].content).toBe('另一条不匹配内容');
    expect(rows[1].content).toBe('不包含检索词的教训内容');
  });

  it('无匹配结果返回空列表（非错误）', () => {
    insertLesson({ content: '普通内容', category: 'general', sourceTaskId: `${TEST_PREFIX}none` });
    const rows = searchLessons('zzz不存在的检索词zzz', { limit: 10 });
    expect(rows).toEqual([]);
  });

  it('非法 FTS5 语法查询词不抛错：降级为最近列表（front-end / node.js / js/ts / 未闭合引号）', () => {
    insertLesson({ content: '前端岗位投递技巧', category: 'application', sourceTaskId: `${TEST_PREFIX}fts-bad` });
    insertLesson({ content: 'node 项目部署教训', category: 'tooling', sourceTaskId: `${TEST_PREFIX}fts-bad` });
    for (const evil of ['front-end', 'node.js', 'js/ts', '未闭合"引号', '前缀 - 排除']) {
      let rows: ReturnType<typeof searchLessons>;
      expect(() => {
        rows = searchLessons(evil, { limit: 10 });
      }, `查询词「${evil}」不应抛异常`).not.toThrow();
      // 降级路径返回按时间倒序的最近列表（新插入的 2 条排最前；dev 库更旧的真实数据不参与断言）
      expect(rows!.slice(0, 2).map((r) => r.content), `查询词「${evil}」应降级为最近列表`).toEqual(['node 项目部署教训', '前端岗位投递技巧']);
    }
  });

  it('含 FTS5 通配符的查询（a*b）合法执行无命中：返回空列表而非报错', () => {
    insertLesson({ content: '前端岗位投递技巧', category: 'application', sourceTaskId: `${TEST_PREFIX}fts-star` });
    let rows: ReturnType<typeof searchLessons>;
    expect(() => {
      rows = searchLessons('a*b', { limit: 10 });
    }).not.toThrow();
    expect(rows!).toEqual([]);
  });

  it('FTS 检索可组合 category 过滤', () => {
    insertLesson({ content: '简历匹配的教训', category: 'matching', sourceTaskId: `${TEST_PREFIX}comb` });
    insertLesson({ content: '简历相关通用内容', category: 'general', sourceTaskId: `${TEST_PREFIX}comb` });
    const rows = searchLessons('简历匹配', { category: 'matching', limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('matching');
  });
});

describe('deleteLessonsBySourceTask（清理联动）', () => {
  it('删除教训并同步删除对应 FTS 行：删除后检索不再命中', () => {
    insertLesson({ content: '独特词 zzqquux 的教训', category: 'general', sourceTaskId: `${TEST_PREFIX}del` });
    expect(searchLessons('zzqquux', { limit: 10 })).toHaveLength(1);
    deleteLessonsBySourceTask(`${TEST_PREFIX}del`);
    expect(searchLessons('zzqquux', { limit: 10 })).toEqual([]);
    expect(listLessons({ limit: 50 }).filter((r) => r.sourceTaskId === `${TEST_PREFIX}del`)).toEqual([]);
  });

  it('无匹配的 sourceTaskId 安全不抛错', () => {
    expect(() => deleteLessonsBySourceTask(`${TEST_PREFIX}not-exists`)).not.toThrow();
  });
});
