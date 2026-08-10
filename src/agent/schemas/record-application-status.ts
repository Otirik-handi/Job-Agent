import { z } from 'zod';

/** recordApplicationStatus 输入：confirmed 缺省 → 预览阶段（出变更摘要不落库）；confirmed=true → 执行阶段（状态推进落库） */
export const recordApplicationStatusInputSchema = z.strictObject({
  jobOpportunityId: z.string().min(1).describe('岗位 ID'),
  target: z.enum(['interview', 'offer', 'hired', 'rejected'])
    .describe('投递后目标状态：interview 面试中 / offer 拿到 offer / hired 接受 offer 入职 / rejected 已拒绝'),
  confirmed: z.boolean().optional().describe('用户已在对话中确认后传 true 进入执行阶段；缺省为预览阶段'),
});
