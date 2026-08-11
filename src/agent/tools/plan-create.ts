import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { createPlan, renderPlanMarkdown } from '../plans';

const inputSchema = z.strictObject({
  taskId: z
    .string()
    .min(1)
    .max(64)
    .describe('计划标识：仅小写字母/数字/连字符（如 weekly-report），作为计划文件 key，不可与既有计划重复'),
  steps: z
    .array(
      z.strictObject({
        title: z.string().min(1).describe('步骤标题（任务级粒度）'),
        successCriteria: z.string().min(1).describe('成功标准：可判定该步完成与否'),
        dependsOn: z
          .array(z.number().int().min(0))
          .optional()
          .describe('该步依赖的步骤索引列表（从 0 开始，可空；引用越界会被拒绝）'),
      }),
    )
    .min(1)
    .max(8)
    .describe('步骤列表：1-8 步'),
});

/**
 * 确定性写入工具（无 LLM 调用，可逆本地文件操作）：创建执行计划（data/plans/<taskId>.md）。
 * 「创建时用户确认」由规划原则的对话流程保证，不在工具层强确认。
 */
export const planCreateTool = createDomainTool({
  name: 'planCreate',
  description: '创建执行计划：把复杂任务拆成 1-8 步（每步含标题与成功标准），持久化到计划文件。当任务多步骤/长链条（求职周报、投递计划、多岗位调研等）且需要用户先确认再逐步执行时调用；简单任务（单步/快速问答）不要调用。参数 taskId 为小写连字符标识（≤64 字符，不可与既有计划重复），steps 为步骤数组（每步 title/successCriteria，可选 dependsOn 声明依赖的步骤索引）。返回 ok、taskId 与 planMarkdown（完整计划全文），须在对话中展示给用户请求确认，确认前不得开始执行步骤；已存在/非法 taskId 返回结构化错误 PLAN_EXISTS/PLAN_INVALID。',
  inputSchema,
  progress: { start: '正在创建计划…', done: '计划创建完成' },
  execute: async (args) => {
    const result = createPlan(args.taskId, args.steps);
    if (!result.ok) return result;
    return { ok: true, taskId: result.value.taskId, planMarkdown: renderPlanMarkdown(result.value) };
  },
});
