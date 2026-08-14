import { describe, expect, it } from 'vitest';
import { mapToolToAction } from './audit-log';

describe('mapToolToAction（工具输出 → 审计记录，纯函数）', () => {
  it('applyJob 成功第二段 → apply_job + entityId', () => {
    const rec = mapToolToAction('applyJob', { ok: true, phase: 'applying', jobOpportunityId: 'job-1' });
    expect(rec).toEqual({ action: 'apply_job', entityType: 'job_opportunity', entityId: 'job-1', result: 'ok' });
  });
  it('applyJob 成功第二段携带专属简历版本明细（投递-版本关联）', () => {
    const rec = mapToolToAction('applyJob', {
      ok: true, phase: 'applied', jobOpportunityId: 'job-1', tailoredResumeId: 'tr-9', tailoredResumeVersion: 2,
    });
    expect(rec).toMatchObject({ action: 'apply_job', result: 'ok' });
    expect(JSON.parse(rec!.detailsJson!)).toEqual({ tailoredResumeId: 'tr-9', tailoredResumeVersion: 2 });
  });
  it('applyJob 无专属简历版本时不写明细（存量兼容）', () => {
    const rec = mapToolToAction('applyJob', { ok: true, phase: 'applied', jobOpportunityId: 'job-1', tailoredResumeId: null, tailoredResumeVersion: null });
    expect(rec).toEqual({ action: 'apply_job', entityType: 'job_opportunity', entityId: 'job-1', result: 'ok' });
    expect(rec!.detailsJson).toBeUndefined();
  });
  it('applyJob 业务失败 → result 记错误码', () => {
    const rec = mapToolToAction('applyJob', { ok: false, error: { code: 'JOB_MATCH_REQUIRED', message: 'x', hint: 'y' } });
    expect(rec).toMatchObject({ action: 'apply_job', result: 'JOB_MATCH_REQUIRED' });
  });
  it('第一段（未确认）不记录', () => {
    expect(mapToolToAction('applyJob', { ok: true, phase: 'preview', jobOpportunityId: 'job-1' })).toBeNull();
  });
  it('recordApplicationStatus 第二段 → record_status', () => {
    const rec = mapToolToAction('recordApplicationStatus', { ok: true, phase: 'interview', jobOpportunityId: 'job-1' });
    expect(rec).toMatchObject({ action: 'record_status', entityId: 'job-1', result: 'ok' });
  });
  it('tailoredResume 第二段 → tailored_resume（entity=tailoredResumeId）', () => {
    const rec = mapToolToAction('tailoredResume', { ok: true, phase: 'generated', tailoredResumeId: 'tr-1', jobOpportunityId: 'job-1' });
    expect(rec).toMatchObject({ action: 'tailored_resume', entityType: 'tailored_resume', entityId: 'tr-1' });
  });
  it('planCreate/planUpdate → plan（entityId=taskId）', () => {
    expect(mapToolToAction('planCreate', { ok: true, taskId: 'weekly' }))
      .toMatchObject({ action: 'plan_create', entityType: 'plan', entityId: 'weekly' });
    expect(mapToolToAction('planUpdate', { ok: true, taskId: 'weekly' }))
      .toMatchObject({ action: 'plan_update', entityType: 'plan', entityId: 'weekly' });
  });
  it('只读工具（listResumes/getMemory/readSkill/webSearch/webFetch）不记录', () => {
    expect(mapToolToAction('listResumes', { ok: true, count: 0 })).toBeNull();
    expect(mapToolToAction('getMemory', { ok: true })).toBeNull();
    expect(mapToolToAction('readSkill', { ok: true })).toBeNull();
    expect(mapToolToAction('webSearch', { ok: true })).toBeNull();
    expect(mapToolToAction('webFetch', { ok: true })).toBeNull();
  });
  it('未知工具不记录', () => {
    expect(mapToolToAction('unknownTool', { ok: true })).toBeNull();
  });
});
