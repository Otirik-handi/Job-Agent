import { expect } from 'vitest';
import type { Scenario } from './types';

const RESUME_TEXT = '张伟\n前端开发工程师，5 年经验\n技能：React、TypeScript、Node.js\n项目：参与 XX 电商平台前端架构设计，主导组件库建设';

export const resumeAnalysisScenario: Scenario = {
  id: 'resume-analysis',
  family: 'high-frequency',
  description: '用户粘贴简历 → agent 导入并分析，产出评分卡（readSkill + importResume + analyzeResume 完整链路）',
  setup: () => { /* 空库起步，全链路从粘贴开始 */ },
  userMessages: [`这是我的简历，帮我分析一下：\n${RESUME_TEXT}`],
  mockScript: [
    { type: 'tool-call', toolName: 'importResume', input: { text: RESUME_TEXT } },
    { type: 'tool-call', toolName: 'readSkill', input: { skillName: 'resume-analysis' } },
    { type: 'tool-call', toolName: 'analyzeResume', input: { resumeId: '$importResume.resumeId' } },
    // analyzeResume 内部 callStructured：符合 resumeAnalysisSchemaV1 的 JSON
    {
      type: 'text',
      text: JSON.stringify({
        schemaVersion: 1,
        overallScore: 72,
        strengths: [{ point: '前端经验 5 年，技术栈匹配度高', evidence: '前端开发工程师，5 年经验' }],
        risks: [{ point: '缺少量化成果描述', evidence: '参与 XX 电商平台前端架构设计' }],
        improvements: [{ suggestion: '补充项目量化指标', priority: 'high' }],
        profile: {
          skills: ['React', 'TypeScript', 'Node.js'],
          experienceYears: 5,
          targetRoles: ['前端工程师'],
          targetCities: [],
        },
        pendingConfirmations: ['推测 5 年前端经验，请确认'],
      }),
    },
    { type: 'text', text: '简历分析完成：整体评分 72 分。优势是 5 年前端经验与 React/TypeScript 技术栈；风险是缺少量化成果，建议补充项目指标。' },
  ],
  assertFinalState: (ctx) => {
    const resume = ctx.query<{ analysis_json: string | null }>('SELECT analysis_json FROM resumes LIMIT 1');
    expect(resume?.analysis_json).not.toBeNull();
    // 结构性断言：只验 schema 与分值边界，不锁具体分数（真实模型给真实分）
    const parsed = JSON.parse(resume!.analysis_json!) as { schemaVersion?: number; overallScore?: number };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.overallScore).toBeGreaterThanOrEqual(0);
    expect(parsed.overallScore).toBeLessThanOrEqual(100);
    // 消息流非空即可（真实模型不会恰好提到 72）
    expect(ctx.allAssistantText()).not.toBe('');
    // 会话状态回写：currentResumeId 应指向导入的简历
    const state = ctx.query<{ state_json: string }>('SELECT state_json FROM session_state LIMIT 1');
    expect(state).not.toBeNull();
    expect(JSON.parse(state!.state_json)).toHaveProperty('currentResumeId');
  },
};
