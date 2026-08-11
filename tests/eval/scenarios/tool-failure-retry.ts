import { expect } from 'vitest';
import type { Scenario } from './types';

const RESUME_TEXT = '张伟\n前端开发工程师，5 年经验\n技能：React、TypeScript';
const ANALYSIS_JSON = JSON.stringify({ schemaVersion: 1, overallScore: 72, strengths: [{ point: '前端经验' }], risks: [], improvements: [], profile: { skills: ['React'], experienceYears: 5, targetRoles: [], targetCities: [] }, pendingConfirmations: [] });

export const toolFailureRetryScenario: Scenario = {
  id: 'tool-failure-retry',
  family: 'recovery',
  description: '工具失败（RESUME_NOT_FOUND）→ agent 换路 listResumes 找到正确 id → 重试成功',
  setup: (ctx) => {
    ctx.exec("INSERT INTO resumes (id, name, source_type, source_text, created_at, updated_at) VALUES ('resume-eval-1', '张伟', 'paste', ?, datetime('now'), datetime('now'))", [RESUME_TEXT]);
  },
  userMessages: ['分析一下我的简历'],
  mockScript: [
    // 第一次尝试用错 id → RESUME_NOT_FOUND 结构化错误
    { type: 'tool-call', toolName: 'analyzeResume', input: { resumeId: 'wrong-id' } },
    // agent 换路：列出现有简历
    { type: 'tool-call', toolName: 'listResumes', input: {} },
    // 用正确 id 重试
    { type: 'tool-call', toolName: 'analyzeResume', input: { resumeId: 'resume-eval-1' } },
    // analyzeResume 内部 callStructured
    { type: 'text', text: JSON.stringify({ schemaVersion: 1, overallScore: 72, strengths: [{ point: '前端经验 5 年' }], risks: [], improvements: [], profile: { skills: ['React', 'TypeScript'], experienceYears: 5, targetRoles: ['前端工程师'], targetCities: [] }, pendingConfirmations: [] }) },
    { type: 'text', text: '简历分析完成：整体评分 72 分。' },
  ],
  assertFinalState: (ctx) => {
    const resume = ctx.query<{ analysis_json: string | null }>('SELECT analysis_json FROM resumes WHERE id = ?', ['resume-eval-1']);
    expect(resume?.analysis_json).not.toBeNull();
    // 消息流同时包含失败处理（listResumes 后重试）与最终成功
    expect(ctx.allAssistantText()).toContain('72');
  },
};
