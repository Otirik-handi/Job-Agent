import { z } from 'zod';
import { fitBandSchema, redFlagHitSchema } from '../jd-red-flags';

/**
 * 岗位匹配契约 v2（三段式：理解 → 匹配矩阵 → 投递建议；产物内嵌 schemaVersion）。
 * v2 增量（吸收外部 skill job-description-analyzer，见 docs/research/2026-08-13-refine-01）：
 * - requirements 增加 classification（required 必须项 / preferred 加分项）
 * - 顶层新增 fitBand（分数区间 → 行动档位）与 redFlags（危险信号清单）——两者由系统
 *   确定性计算（LLM 不输出，见 jobMatchResultSchemaV2），保证可复现、不漂移。
 */

/** LLM 结构化输出契约：仅产出需要语义判断的部分；fitBand/redFlags 由代码合并 */
export const jobMatchLLMOutputSchemaV2 = z.object({
  schemaVersion: z.literal(2),
  understanding: z.object({
    company: z.string().describe('公司名称（从 JD 中提取，未知则为空串）'),
    title: z.string().describe('职位名称（从 JD 中提取，未知则为空串）'),
    requirements: z.array(z.object({
      id: z.string().regex(/^r\d+$/).describe('要求编号，稳定 id：r1、r2…'),
      text: z.string().describe('要求内容（从 JD 提炼）'),
      type: z.enum(['skill', 'experience', 'education', 'responsibility', 'other']).describe('要求类型'),
      classification: z.enum(['required', 'preferred']).describe('要求分类：required 必须项（硬性要求）/ preferred 加分项'),
    })).min(1).max(8),
    city: z.string().nullable().describe('工作城市，未知为 null'),
    level: z.string().nullable().describe('职级/资历要求，未知为 null'),
    tags: z.array(z.string()).max(10).describe('岗位标签（技术栈/关键词）'),
  }),
  fitResults: z.array(z.object({
    requirementId: z.string().regex(/^r\d+$/).describe('对应 understanding.requirements 的 id'),
    level: z.enum(['highly-matched', 'matched', 'partial', 'mismatch'])
      .describe('匹配度：highly-matched 高度匹配 / matched 匹配 / partial 部分匹配 / mismatch 不匹配'),
    evidence: z.string().describe('简历原文中的证据片段；无证据则说明缺失'),
    note: z.string().describe('说明：匹配点或不匹配点（mismatch 须标注差距等级 critical/major/minor 及应对策略）'),
  })).min(1).max(8),
  overallScore: z.number().int().min(0).max(100)
    .describe('整体匹配评分 0-100，按加权模型计算：required 项得分率 × 70% + preferred 项得分率 × 30%'),
  risks: z.array(z.object({
    point: z.string().describe('风险点'),
    evidence: z.string().optional().describe('简历原文证据片段'),
  })).max(8),
  advice: z.object({
    mustFix: z.array(z.string()).max(8).describe('必备修改：针对 partial/mismatch 项的简历修改建议（按差距等级给出应对策略）'),
    resumeAdjustments: z.array(z.string()).max(8).describe('简历调整：如何突出 highly-matched 项'),
    talkingPoints: z.array(z.string()).max(8).describe('面试/沟通谈话要点'),
    truthBoundary: z.string().describe('真实性边界提示：不得虚构经历、技能、雇主、证书'),
  }),
});

export type JobMatchLLMOutputV2 = z.infer<typeof jobMatchLLMOutputSchemaV2>;

/** 完整落库契约：LLM 产物 + 系统确定性字段（fitBand/redFlags） */
export const jobMatchResultSchemaV2 = jobMatchLLMOutputSchemaV2.extend({
  fitBand: fitBandSchema.describe('匹配分区间档位（由系统按 overallScore 确定性映射）'),
  redFlags: z.array(redFlagHitSchema).max(12).describe('JD 危险信号（由系统对 JD 文本确定性检测）'),
});

export type JobMatchResultV2 = z.infer<typeof jobMatchResultSchemaV2>;
