import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { PLAN_STEP_STATUSES, summarizePlan, updatePlanStep } from '../plans';

const inputSchema = z.strictObject({
  taskId: z.string().min(1).max(64).describe('计划标识（planCreate 时的 taskId）'),
  stepIndex: z.number().int().min(0).describe('步骤索引（从 0 开始）'),
  status: z
    .enum(PLAN_STEP_STATUSES)
    .describe('目标状态：todo / in_progress / done / blocked（done/blocked 为终态不可回退）'),
  note: z.string().optional().describe('备注：步骤标记为 blocked 时必填失败原因'),
});

/**
 * 确定性写入工具（无 LLM 调用，可逆本地文件操作）：推进计划步骤状态。
 * 状态机单向推进（todo → in_progress → done/blocked），done/blocked 为终态不可回退。
 */
export const planUpdateTool = createDomainTool({
  name: 'planUpdate',
  description: '更新执行计划中某一步的状态：每步执行后把状态推进为 in_progress/done，遇到障碍标记为 blocked 并附 note 记录原因。仅用于既有计划的进度推进；计划不存在、或步骤已处于终态（done/blocked）时不要调用。参数 taskId 为计划标识，stepIndex 为步骤索引（从 0 开始），status 为目标状态（todo/in_progress/done/blocked，终态不可回退），note 在 blocked 时必填失败原因。返回 ok、taskId 与 planSummary（总步数、各状态计数、当前进行中步骤）；计划不存在/步骤越界/非法流转返回结构化错误 PLAN_NOT_FOUND/PLAN_STEP_INVALID/PLAN_STATUS_INVALID。',
  inputSchema,
  progress: { start: '正在更新计划…', done: '计划更新完成' },
  execute: async (args) => {
    const result = updatePlanStep(args.taskId, args.stepIndex, args.status, args.note);
    if (!result.ok) return result;
    return { ok: true, taskId: result.value.taskId, planSummary: summarizePlan(result.value) };
  },
});
