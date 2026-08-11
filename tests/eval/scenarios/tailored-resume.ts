import { expect } from 'vitest';
import type { Scenario } from './types';

const JD_TEXT = 'XX 科技 招聘高级前端工程师\n要求：5 年以上前端经验，熟悉 React';
const RESUME_TEXT = '张伟\n前端开发工程师，5 年经验\n技能：React、TypeScript\n项目：主导 XX 电商平台组件库建设';
const ANALYSIS_JSON = JSON.stringify({
  schemaVersion: 1, overallScore: 70,
  strengths: [{ point: '前端经验 5 年' }], risks: [], improvements: [],
  profile: { skills: ['React', 'TypeScript'], experienceYears: 5, targetRoles: ['前端工程师'], targetCities: [] },
  pendingConfirmations: [],
});
const FIT_JSON = JSON.stringify({
  schemaVersion: 1,
  understanding: { company: 'XX 科技', title: '高级前端工程师', requirements: [{ id: 'r1', text: '5 年以上前端经验', type: 'experience' }], city: '北京', level: '高级', tags: ['React'] },
  fitResults: [{ requirementId: 'r1', level: 'highly-matched', evidence: '前端开发工程师，5 年经验', note: '匹配' }],
  overallScore: 85, risks: [],
  advice: { mustFix: [], resumeAdjustments: [], talkingPoints: [], truthBoundary: '不得虚构' },
});

const SOURCE_FRAGMENT = '前端开发工程师，5 年经验';
const SUGGESTED_TEXT = '前端开发工程师，5 年经验，主导过电商组件库建设';

export const tailoredResumeScenario: Scenario = {
  id: 'tailored-resume',
  family: 'orchestration',
  description: '两段式强确认：出建议清单 → 用户确认 → 生成专属简历落库',
  setup: (ctx) => {
    ctx.exec("INSERT INTO resumes (id, name, source_type, source_text, analysis_json, created_at, updated_at) VALUES ('resume-eval-1', '张伟', 'paste', ?, ?, datetime('now'), datetime('now'))", [RESUME_TEXT, ANALYSIS_JSON]);
    ctx.exec("INSERT INTO job_opportunities (id, company, title, jd_text, status, fit_result_json, created_at, updated_at) VALUES ('job-eval-1', 'XX 科技', '高级前端工程师', ?, 'saved', ?, datetime('now'), datetime('now'))", [JD_TEXT, FIT_JSON]);
  },
  userMessages: ['针对这个岗位帮我生成专属简历', '确认，按建议修改'],
  mockScript: [
    // 第一段：tailoredResume 建议阶段
    { type: 'tool-call', toolName: 'tailoredResume', input: { jobOpportunityId: 'job-eval-1', resumeId: 'resume-eval-1' } },
    // 内部 callStructured：resumeEditSuggestionsSchemaV1；sourceText 必须逐字匹配简历原文
    {
      type: 'text',
      text: JSON.stringify({
        schemaVersion: 1,
        edits: [
          { id: 'e1', section: 'experience', sourceText: SOURCE_FRAGMENT, suggestedText: SUGGESTED_TEXT, reason: '对齐 r1：突出 5 年经验与组件库建设', factRisk: 'confirmed' },
        ],
      }),
    },
    { type: 'text', text: '已生成 1 条替换建议（1 条事实重述）：将「前端开发工程师，5 年经验」调整为「前端开发工程师，5 年经验，主导过电商组件库建设」。请确认是否按此修改。' },
    // 第二段：携带 confirmedEdits 生成（用户确认消息后）
    { type: 'tool-call', toolName: 'tailoredResume', input: { jobOpportunityId: 'job-eval-1', resumeId: 'resume-eval-1', confirmedEdits: [{ id: 'e1', sourceText: SOURCE_FRAGMENT, suggestedText: SUGGESTED_TEXT }] } },
    { type: 'text', text: '专属简历 v1 已生成并保存，可在界面「专属简历」中查看。' },
  ],
  assertFinalState: (ctx) => {
    const row = ctx.query<{ content_markdown: string }>('SELECT content_markdown FROM tailored_resumes WHERE resume_id = ? AND job_opportunity_id = ?', ['resume-eval-1', 'job-eval-1']);
    expect(row).not.toBeNull();
    expect(row!.content_markdown).toContain(SUGGESTED_TEXT);
  },
};
