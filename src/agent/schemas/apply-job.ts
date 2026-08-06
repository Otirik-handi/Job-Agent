import { z } from 'zod';

/** applyJob 输入：confirmed 缺省 → 预览阶段（出摘要不落库）；confirmed=true → 执行阶段（状态推进落库） */
export const applyJobInputSchema = z.object({
  jobOpportunityId: z.string().min(1).describe('岗位 ID'),
  action: z.enum(['apply', 'skip']).describe('apply：投递推进（matched→applying→applied）；skip：跳过（非终态→skipped）'),
  confirmed: z.boolean().optional().describe('用户已在对话中确认后传 true 进入执行阶段；缺省为预览阶段'),
});
