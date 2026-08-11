import { expect } from 'vitest';
import type { Scenario } from './types';

const JD_TEXT = 'XX 科技 招聘高级前端工程师\n投递：官网 https://xx.tech/careers\n邮箱 hr@xx.tech';
const RESUME_TEXT = '张伟\n前端开发工程师，5 年经验';
const ANALYSIS_JSON = JSON.stringify({ schemaVersion: 1, overallScore: 70, strengths: [], risks: [], improvements: [], profile: { skills: [], experienceYears: 5, targetRoles: [], targetCities: [] }, pendingConfirmations: [] });
const FIT_JSON = JSON.stringify({
  schemaVersion: 1,
  understanding: { company: 'XX 科技', title: '高级前端工程师', requirements: [{ id: 'r1', text: '前端经验', type: 'experience' }], city: '', level: '', tags: [] },
  fitResults: [{ requirementId: 'r1', level: 'matched', evidence: '前端开发工程师，5 年经验', note: '' }],
  overallScore: 80, risks: [],
  advice: { mustFix: [], resumeAdjustments: [], talkingPoints: [], truthBoundary: '' },
});

export const applyJobScenario: Scenario = {
  id: 'apply-job',
  family: 'orchestration',
  description: '两段式审批：投递预览 → 用户确认 → 状态推进落库（matched→applying）+ status_history',
  setup: (ctx) => {
    ctx.exec("INSERT INTO resumes (id, name, source_type, source_text, analysis_json, created_at, updated_at) VALUES ('resume-eval-1', '张伟', 'paste', ?, ?, datetime('now'), datetime('now'))", [RESUME_TEXT, ANALYSIS_JSON]);
    ctx.exec("INSERT INTO job_opportunities (id, company, title, jd_text, status, fit_result_json, channels_json, created_at, updated_at) VALUES ('job-eval-1', 'XX 科技', '高级前端工程师', ?, 'matched', ?, ?, datetime('now'), datetime('now'))", [JD_TEXT, FIT_JSON, JSON.stringify({ schemaVersion: 1, channels: [{ id: 'c1', type: 'official', label: '官网投递页', url: 'https://xx.tech/careers', email: null, verification: 'verified', riskSignals: [] }] })]);
  },
  userMessages: ['帮我把这个岗位投出去', '确认'],
  mockScript: [
    { type: 'tool-call', toolName: 'applyJob', input: { jobOpportunityId: 'job-eval-1', action: 'apply' } },
    { type: 'text', text: '投递摘要：将把岗位从 matched 推进到 applying。推荐渠道：官网投递页（已核验）。请确认后执行投递。' },
    { type: 'tool-call', toolName: 'applyJob', input: { jobOpportunityId: 'job-eval-1', action: 'apply', confirmed: true } },
    { type: 'text', text: '已标记为投递中（applying）。' },
  ],
  assertFinalState: (ctx) => {
    const job = ctx.query<{ status: string }>('SELECT status FROM job_opportunities WHERE id = ?', ['job-eval-1']);
    expect(job?.status).toBe('applying');
    const hist = ctx.query<{ from_status: string; to_status: string }>('SELECT from_status, to_status FROM status_history WHERE job_opportunity_id = ? ORDER BY created_at DESC LIMIT 1', ['job-eval-1']);
    expect(hist).toMatchObject({ from_status: 'matched', to_status: 'applying' });
  },
};
