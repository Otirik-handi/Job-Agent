import { expect } from 'vitest';
import type { Scenario } from './types';

const JD_TEXT = 'XX 科技 招聘高级前端工程师';
const RESUME_TEXT = '张伟\n前端开发工程师，5 年经验';
const ANALYSIS_JSON = JSON.stringify({ schemaVersion: 1, overallScore: 70, strengths: [], risks: [], improvements: [], profile: { skills: [], experienceYears: 5, targetRoles: [], targetCities: [] }, pendingConfirmations: [] });
const FIT_JSON = JSON.stringify({
  schemaVersion: 1,
  understanding: { company: 'XX 科技', title: '高级前端工程师', requirements: [{ id: 'r1', text: '前端经验', type: 'experience' }], city: '', level: '', tags: [] },
  fitResults: [{ requirementId: 'r1', level: 'matched', evidence: '', note: '' }],
  overallScore: 80, risks: [],
  advice: { mustFix: [], resumeAdjustments: [], talkingPoints: [], truthBoundary: '' },
});

export const recordStatusScenario: Scenario = {
  id: 'record-status',
  family: 'orchestration',
  description: '投递后状态：轻确认两段式（预览 → 确认 → applied→interview 落库 + 时序记录）',
  setup: (ctx) => {
    ctx.exec("INSERT INTO resumes (id, name, source_type, source_text, analysis_json, created_at, updated_at) VALUES ('resume-eval-1', '张伟', 'paste', ?, ?, datetime('now'), datetime('now'))", [RESUME_TEXT, ANALYSIS_JSON]);
    ctx.exec("INSERT INTO job_opportunities (id, company, title, jd_text, status, fit_result_json, created_at, updated_at) VALUES ('job-eval-1', 'XX 科技', '高级前端工程师', ?, 'applied', ?, datetime('now'), datetime('now'))", [JD_TEXT, FIT_JSON]);
  },
  userMessages: ['我刚面试完这家公司，进入二面了', '确认'],
  mockScript: [
    { type: 'tool-call', toolName: 'recordApplicationStatus', input: { jobOpportunityId: 'job-eval-1', target: 'interview' } },
    { type: 'text', text: '变更摘要：将把岗位从 applied 记录为 面试中（interview）。界面会展示「确认记录」按钮。' },
    { type: 'tool-call', toolName: 'recordApplicationStatus', input: { jobOpportunityId: 'job-eval-1', target: 'interview', confirmed: true } },
    { type: 'text', text: '已记录为面试中（interview）。' },
  ],
  assertFinalState: (ctx) => {
    const job = ctx.query<{ status: string }>('SELECT status FROM job_opportunities WHERE id = ?', ['job-eval-1']);
    expect(job?.status).toBe('interview');
    const hist = ctx.query<{ from_status: string; to_status: string }>('SELECT from_status, to_status FROM status_history WHERE job_opportunity_id = ? ORDER BY created_at DESC LIMIT 1', ['job-eval-1']);
    expect(hist).toMatchObject({ from_status: 'applied', to_status: 'interview' });
  },
};
