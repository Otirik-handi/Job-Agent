import { expect } from 'vitest';
import type { Scenario } from './types';

const JD_TEXT = 'XX 科技 招聘高级前端工程师\n要求：1. 本科及以上学历\n2. 5 年以上前端开发经验，熟悉 React\n3. 有大型电商项目经验\n工作地点：北京\n薪资：25-35k';

const RESUME_TEXT = '张伟\n前端开发工程师，5 年经验\n技能：React、TypeScript、Node.js\n项目：参与 XX 电商平台前端架构设计，主导组件库建设';

/** 与 resumeAnalysisSchemaV1 一致的最小合法分析产物（setup 预插，跳过分析环节） */
const ANALYSIS_JSON = JSON.stringify({
  schemaVersion: 1,
  overallScore: 70,
  strengths: [{ point: '前端经验 5 年' }],
  risks: [],
  improvements: [],
  profile: { skills: ['React', 'TypeScript'], experienceYears: 5, targetRoles: ['前端工程师'], targetCities: [] },
  pendingConfirmations: [],
});

export const jdMatchScenario: Scenario = {
  id: 'jd-match',
  family: 'high-frequency',
  description: '用户给 JD → agent 导入岗位并匹配（importJobOpportunity + matchJob），产出匹配结论',
  setup: (ctx) => {
    ctx.exec(
      "INSERT INTO resumes (id, name, source_type, source_text, analysis_json, created_at, updated_at) VALUES ('resume-eval-1', '张伟', 'paste', ?, ?, datetime('now'), datetime('now'))",
      [RESUME_TEXT, ANALYSIS_JSON],
    );
  },
  userMessages: [`帮我看看这个岗位适不适合我：\n${JD_TEXT}`],
  mockScript: [
    { type: 'tool-call', toolName: 'importJobOpportunity', input: { text: JD_TEXT } },
    { type: 'tool-call', toolName: 'matchJob', input: { jobOpportunityId: '$importJobOpportunity.jobOpportunityId' } },
    // matchJob 内部 callStructured：符合 jobMatchResultSchemaV1，fitResults 必须引用存在的 requirementId
    {
      type: 'text',
      text: JSON.stringify({
        schemaVersion: 1,
        understanding: {
          company: 'XX 科技',
          title: '高级前端工程师',
          requirements: [
            { id: 'r1', text: '本科及以上学历', type: 'education' },
            { id: 'r2', text: '5 年以上前端经验，熟悉 React', type: 'experience' },
            { id: 'r3', text: '大型电商项目经验', type: 'experience' },
          ],
          city: '北京',
          level: '高级',
          tags: ['React', '电商'],
        },
        fitResults: [
          { requirementId: 'r1', level: 'matched', evidence: '简历未明确学历，需确认', note: '学历未在简历中体现' },
          { requirementId: 'r2', level: 'highly-matched', evidence: '前端开发工程师，5 年经验', note: '经验与技能均匹配' },
          { requirementId: 'r3', level: 'matched', evidence: '参与 XX 电商平台前端架构设计', note: '有电商项目背景' },
        ],
        overallScore: 85,
        risks: [{ point: '学历信息缺失', evidence: '简历无学历字段' }],
        advice: {
          mustFix: ['补充学历信息'],
          resumeAdjustments: ['突出电商架构经验'],
          talkingPoints: ['组件库建设与性能优化'],
          truthBoundary: '不得虚构经历、技能、雇主、证书',
        },
      }),
    },
    { type: 'text', text: '匹配完成：整体匹配度 85 分。经验与 React 技能高度匹配；风险是学历未在简历体现，建议补充。' },
  ],
  assertFinalState: (ctx) => {
    const job = ctx.query<{ fit_result_json: string | null }>('SELECT fit_result_json FROM job_opportunities LIMIT 1');
    expect(job?.fit_result_json).not.toBeNull();
    expect(JSON.parse(job!.fit_result_json!)).toMatchObject({ overallScore: 85 });
    expect(ctx.allAssistantText()).toContain('85');
  },
};
