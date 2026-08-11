import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { readPlan, renderPlanMarkdown } from '../plans';

const inputSchema = z.strictObject({
  taskId: z
    .string()
    .min(1)
    .max(64)
    .describe('计划标识（planCreate 时的 taskId，仅小写字母/数字/连字符）'),
});

/**
 * 确定性只读工具（无 LLM 调用，免确认）：按 taskId 读取计划全文（data/plans/<taskId>.md）。
 * 中断恢复时 Agent 先 planRead 读全文（步骤成功标准/依赖/备注），再决定续跑动作；
 * 与 readSkill 同构——工具自主读取，路径穿越与状态机由代码强制而非模型自律。
 */
export const planReadTool = createDomainTool({
  name: 'planRead',
  description: '读取执行计划的完整内容（Markdown 全文：标题、每步标题/成功标准/依赖/产出物/备注）。何时用：需要查看计划全文或步骤成功标准时，如中断恢复续跑前核对当前进度、确认某步成功标准、查看 blocked 步骤的失败备注；计划全文已在上下文中、或只需进度摘要时不要调用。参数 taskId 为计划标识（planCreate 时创建）。返回 ok、taskId 与 planMarkdown（计划全文）；计划不存在或文件损坏返回结构化错误 PLAN_NOT_FOUND。',
  inputSchema,
  progress: { start: '正在读取计划…', done: '计划读取完成' },
  execute: async (args) => {
    const plan = readPlan(args.taskId);
    if (!plan) {
      return {
        ok: false,
        error: {
          code: 'PLAN_NOT_FOUND',
          message: `计划「${args.taskId}」不存在`,
          hint: '请先调用 planCreate 创建计划后重试；或核对 taskId 是否有拼写错误。',
        },
      };
    }
    return { ok: true, taskId: plan.taskId, planMarkdown: renderPlanMarkdown(plan) };
  },
});
