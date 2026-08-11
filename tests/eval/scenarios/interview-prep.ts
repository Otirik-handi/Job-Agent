import { expect } from 'vitest';
import type { Scenario } from './types';

const JD_TEXT = 'XX 科技 招聘高级前端工程师\n要求：5 年以上前端经验，熟悉 React\n工作地点：北京';
const RESUME_TEXT = '张伟\n前端开发工程师，5 年经验\n技能：React、TypeScript\n项目：主导 XX 电商平台组件库建设';
const ANALYSIS_JSON = JSON.stringify({
  schemaVersion: 1,
  overallScore: 70,
  strengths: [{ point: '前端经验 5 年' }],
  risks: [],
  improvements: [],
  profile: { skills: ['React', 'TypeScript'], experienceYears: 5, targetRoles: ['前端工程师'], targetCities: [] },
  pendingConfirmations: [],
});
const FIT_JSON = JSON.stringify({
  schemaVersion: 1,
  understanding: { company: 'XX 科技', title: '高级前端工程师', requirements: [{ id: 'r1', text: '5 年以上前端经验', type: 'experience' }], city: '北京', level: '高级', tags: ['React'] },
  fitResults: [{ requirementId: 'r1', level: 'highly-matched', evidence: '前端开发工程师，5 年经验', note: '匹配' }],
  overallScore: 85,
  risks: [],
  advice: { mustFix: [], resumeAdjustments: [], talkingPoints: ['组件库建设'], truthBoundary: '不得虚构' },
});

export const interviewPrepScenario: Scenario = {
  id: 'interview-prep',
  family: 'high-frequency',
  description: '已匹配岗位 → 用户要求面试准备（prepareInterview 生成准备包）',
  setup: (ctx) => {
    ctx.exec("INSERT INTO resumes (id, name, source_type, source_text, analysis_json, created_at, updated_at) VALUES ('resume-eval-1', '张伟', 'paste', ?, ?, datetime('now'), datetime('now'))", [RESUME_TEXT, ANALYSIS_JSON]);
    ctx.exec("INSERT INTO job_opportunities (id, company, title, jd_text, status, fit_result_json, created_at, updated_at) VALUES ('job-eval-1', 'XX 科技', '高级前端工程师', ?, 'saved', ?, datetime('now'), datetime('now'))", [JD_TEXT, FIT_JSON]);
  },
  userMessages: ['帮我准备这家公司的面试'],
  mockScript: [
    { type: 'tool-call', toolName: 'prepareInterview', input: { jobOpportunityId: 'job-eval-1' } },
    // prepareInterview 内部 callStructured：符合 interviewPrepSchemaV1
    {
      type: 'text',
      text: JSON.stringify({
        schemaVersion: 1,
        companyBrief: 'XX 科技，高级前端工程师岗，要求 5 年前端经验与 React',
        selfIntro: '我是一名有 5 年经验的前端工程师，主导过电商平台组件库建设…',
        questions: [
          { id: 'q1', question: '请介绍一个你主导的组件库项目', intent: '考察项目深度与架构能力', answerPoints: ['背景', '方案', '结果'], evidence: '主导 XX 电商平台组件库建设', risk: null },
        ],
        askThem: ['团队前端技术栈演进方向？'],
      }),
    },
    { type: 'text', text: '面试准备包已生成：1 个核心预测问题 + 提问清单，完整内容可在岗位详情查看。' },
  ],
  assertFinalState: (ctx) => {
    const job = ctx.query<{ interview_prep_json: string | null }>('SELECT interview_prep_json FROM job_opportunities WHERE id = ?', ['job-eval-1']);
    expect(job?.interview_prep_json).not.toBeNull();
    expect(JSON.parse(job!.interview_prep_json!)).toMatchObject({ companyBrief: expect.stringContaining('XX 科技') });
  },
};
