import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, initDb } from '../index';
import { conversations } from '../schema';
import { getLatestApplyActionDetails, insertAction, listActions, parseActionDetails } from './actions';

beforeEach(() => {
  initDb(':memory:');
  migrate(db, { migrationsFolder: 'src/db/migrations' });
});

afterEach(() => {
  initDb(); // 恢复默认连接
});

/** actions.conversation_id 有 FK，测试会话须先行落库（固定 id 便于断言） */
function seedConversation(id: string): void {
  const now = new Date().toISOString();
  db.insert(conversations).values({ id, title: '测试会话', createdAt: now, updatedAt: now }).run();
}

describe('insertAction / listActions（审计动作存取）', () => {
  it('写入后按会话/动作过滤取回', () => {
    seedConversation('conv-1');
    seedConversation('conv-2');
    insertAction({ conversationId: 'conv-1', action: 'apply_job', entityType: 'job_opportunity', entityId: 'job-1', result: 'ok' });
    insertAction({ conversationId: 'conv-1', action: 'record_status', entityType: 'job_opportunity', entityId: 'job-1', result: 'NOT_APPLIED' });
    insertAction({ conversationId: 'conv-2', action: 'apply_job', entityType: 'job_opportunity', entityId: 'job-2', result: 'ok' });

    const conv1 = listActions({ conversationId: 'conv-1' });
    expect(conv1).toHaveLength(2);

    const applyOnly = listActions({ action: 'apply_job' });
    expect(applyOnly).toHaveLength(2);

    const both = listActions({ conversationId: 'conv-1', action: 'apply_job' });
    expect(both).toHaveLength(1);
    expect(both[0]).toMatchObject({ entityId: 'job-1', result: 'ok' });
  });

  it('limit 生效且按时间倒序', () => {
    seedConversation('conv-3');
    for (let i = 0; i < 5; i++) {
      insertAction({ conversationId: 'conv-3', action: 'import_resume', entityType: 'resume', entityId: `r-${i}`, result: 'ok' });
    }
    const rows = listActions({ conversationId: 'conv-3', limit: 3 });
    expect(rows).toHaveLength(3);
    // 倒序：最新的在前（entityId r-4 最新）
    expect(rows[0].entityId).toBe('r-4');
  });

  it('details_json 写入与读取（投递-版本关联）', () => {
    seedConversation('conv-4');
    insertAction({
      conversationId: 'conv-4', action: 'apply_job', entityType: 'job_opportunity', entityId: 'job-1', result: 'ok',
      detailsJson: JSON.stringify({ tailoredResumeId: 'tr-9', tailoredResumeVersion: 2 }),
    });
    const row = listActions({ conversationId: 'conv-4' })[0];
    expect(parseActionDetails(row.detailsJson)).toEqual({ tailoredResumeId: 'tr-9', tailoredResumeVersion: 2 });
  });

  it('getLatestApplyActionDetails：取最近一次成功 apply_job 的明细（失败/旧动作不干扰）', () => {
    seedConversation('conv-5');
    insertAction({ conversationId: 'conv-5', action: 'apply_job', entityType: 'job_opportunity', entityId: 'job-1', result: 'JOB_MATCH_REQUIRED' });
    insertAction({ conversationId: 'conv-5', action: 'apply_job', entityType: 'job_opportunity', entityId: 'job-1', result: 'ok', detailsJson: JSON.stringify({ tailoredResumeId: 'tr-1', tailoredResumeVersion: 1 }) });
    insertAction({ conversationId: 'conv-5', action: 'apply_job', entityType: 'job_opportunity', entityId: 'job-1', result: 'ok', detailsJson: JSON.stringify({ tailoredResumeId: 'tr-2', tailoredResumeVersion: 2 }) });
    expect(getLatestApplyActionDetails('job-1')).toEqual({ tailoredResumeId: 'tr-2', tailoredResumeVersion: 2 });
    expect(getLatestApplyActionDetails('job-2')).toBeNull();
  });

  it('parseActionDetails 宽容解析（缺失/非法返回 null）', () => {
    expect(parseActionDetails(null)).toBeNull();
    expect(parseActionDetails('not-json')).toBeNull();
    expect(parseActionDetails('{"foo":1}')).toBeNull();
  });
});
