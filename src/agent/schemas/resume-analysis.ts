import { z } from 'zod';

/**
 * 简历分析契约 v2（产物 JSON 内嵌 schemaVersion，读取按版本宽容解析）。
 * v2 增量（吸收外部 skill resume-ats-optimizer，见 docs/research/2026-08-13-refine-03）：
 * 新增 atsChecks（ATS 兼容性确定性检查清单）——由系统对简历纯文本计算，LLM 不输出。
 */

/** LLM 结构化输出契约：分析主体（评分/优势/风险/改进/画像/待确认） */
export const resumeAnalysisLLMOutputSchemaV2 = z.object({
  schemaVersion: z.literal(2),
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

export type ResumeAnalysisLLMOutputV2 = z.infer<typeof resumeAnalysisLLMOutputSchemaV2>;

/** 完整落库契约：LLM 产物 + 系统确定性字段（atsChecks） */
export const resumeAnalysisSchemaV2 = resumeAnalysisLLMOutputSchemaV2.extend({
  atsChecks: z.array(z.object({
    check: z.string().describe('检查项名称'),
    ok: z.boolean().describe('是否通过'),
    issue: z.string().optional().describe('不通过时的中文说明'),
  })).max(8).describe('ATS 兼容性检查清单（由系统对简历纯文本确定性检查）'),
});

export type ResumeAnalysisV2 = z.infer<typeof resumeAnalysisSchemaV2>;
