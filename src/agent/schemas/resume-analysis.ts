import { z } from 'zod';

/** 简历分析契约 v1（产物 JSON 内嵌 schemaVersion，读取按版本宽容解析） */
export const resumeAnalysisSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  overallScore: z.number().int().min(0).max(100).describe('简历整体评分 0-100'),
  strengths: z.array(z.object({
    point: z.string().describe('优势要点'),
    evidence: z.string().optional().describe('简历原文中的证据片段'),
  })).max(8),
  risks: z.array(z.object({
    point: z.string().describe('风险/短板要点'),
    evidence: z.string().optional().describe('简历原文中的证据片段'),
  })).max(8),
  improvements: z.array(z.object({
    suggestion: z.string().describe('改进建议'),
    priority: z.enum(['high', 'medium', 'low']).describe('优先级'),
  })).max(8),
  profile: z.object({
    skills: z.array(z.string()).max(30).describe('简历中出现的技能关键词'),
    experienceYears: z.number().min(0).max(60).nullable().describe('估计的工作年限，无法判断为 null'),
    targetRoles: z.array(z.string()).max(10).describe('推测的目标岗位方向'),
    targetCities: z.array(z.string()).max(10).describe('推测的目标城市'),
  }),
  pendingConfirmations: z.array(z.string()).max(10).describe('需要用户确认的推断项（如"推测 3 年前端经验，请确认"）'),
});

export type ResumeAnalysisV1 = z.infer<typeof resumeAnalysisSchemaV1>;
