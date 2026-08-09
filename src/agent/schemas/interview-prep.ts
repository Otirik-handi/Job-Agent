import { z } from 'zod';

/** 面试准备包契约 v1（产物内嵌 schemaVersion，读取按版本宽容解析） */
export const interviewPrepSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  companyBrief: z.string().describe('公司/岗位背景要点（面试前必读，基于 JD 与简历原文）'),
  selfIntro: z.string().describe('自我介绍话术（约 1 分钟，基于简历原文，不虚构）'),
  questions: z.array(z.object({
    id: z.string().regex(/^q\d+$/).describe('问题编号，稳定 id：q1、q2…'),
    question: z.string().describe('预测的面试问题'),
    intent: z.string().describe('考察意图（该问题在考察什么）'),
    answerPoints: z.array(z.string()).min(1).max(6).describe('应答思路要点（STAR 结构）'),
    evidence: z.string().nullable().describe('简历原文证据引用；无支撑时为 null'),
    risk: z.string().nullable().describe('证据薄弱时的风险提示 + 建议；无风险时为 null'),
  })).min(1).max(8),
  askThem: z.array(z.string()).max(8).describe('向面试官提问清单（面试尾段用，基于岗位/公司）'),
});

export type InterviewPrepV1 = z.infer<typeof interviewPrepSchemaV1>;
