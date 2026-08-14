import { z } from 'zod';

/**
 * 面试准备包契约 v2（产物内嵌 schemaVersion，读取按版本宽容解析）。
 * v2 增量（吸收外部 skill interview-prep-generator，见 docs/research/2026-08-13-refine-09）：
 * - questions 增加 probability（预测题概率分级 high/medium/low，高概率题需充分准备）
 * - 新增 redFlags（红线答案提示：别提的话题/别批评的前雇主方面/陷阱题）
 * 均为 LLM 语义输出，保持简单枚举/数组形态（避免复杂嵌套，对齐真实层稳定性教训）。
 */
export const interviewPrepSchemaV2 = z.object({
  schemaVersion: z.literal(2),
  companyBrief: z.string().describe('公司/岗位背景要点（面试前必读，基于 JD 与简历原文）'),
  selfIntro: z.string().describe('自我介绍话术（约 1 分钟，基于简历原文，不虚构）'),
  questions: z.array(z.object({
    id: z.string().regex(/^q\d+$/).describe('问题编号，稳定 id：q1、q2…'),
    question: z.string().describe('预测的面试问题'),
    intent: z.string().describe('考察意图（该问题在考察什么）'),
    answerPoints: z.array(z.string()).min(1).max(6).describe('应答思路要点（STAR 结构）'),
    evidence: z.string().nullable().describe('简历原文证据引用；无支撑时为 null'),
    risk: z.string().nullable().describe('证据薄弱时的风险提示 + 建议；无风险时为 null'),
    probability: z.enum(['high', 'medium', 'low'])
      .describe('被问概率分级：high 高概率（必须充分准备并绑定简历证据）/ medium 中概率 / low 低概率'),
  })).min(1).max(8),
  redFlags: z.array(z.string()).max(8).describe('红线答案提示：面试中别提的话题、别批评的前雇主方面、警惕的陷阱题'),
  askThem: z.array(z.string()).max(8).describe('向面试官提问清单（面试尾段用，基于岗位/公司）'),
});

export type InterviewPrepV2 = z.infer<typeof interviewPrepSchemaV2>;
