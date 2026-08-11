import { getActivePlans, readPlan, type ActivePlanSummary } from '@/src/agent/plans';

/** 活跃计划进度投影（列表投影约定：只精选字段，不返回计划全文/备注等大字段） */
export type ActivePlanProgress = {
  taskId: string;
  title: string;
  /** 当前进行中步骤索引（第一个 in_progress，0-based）；无则为 null */
  currentStepIndex: number | null;
  totalSteps: number;
  /** 当前进行中步骤标题；无 in_progress 步骤或文件损坏时为 null */
  currentStepTitle: string | null;
  statusCounts: { todo: number; in_progress: number; done: number; blocked: number };
};

/**
 * 活跃计划进度投影（纯函数，plansDir 可注入便于单测）：
 * getActivePlans 返回结构不含当前步骤标题，此处按需二次读计划文件补充
 * currentStepTitle（本地同步文件读取，单用户应用开销可忽略）。
 */
export function buildActivePlanProjection(
  active: ActivePlanSummary[],
  plansDir?: string,
): ActivePlanProgress[] {
  return active.map((item) => {
    const plan = readPlan(item.taskId, plansDir);
    const currentStepTitle =
      item.currentStepIndex === null || !plan
        ? null
        : (plan.steps[item.currentStepIndex]?.title ?? null);
    return {
      taskId: item.taskId,
      title: item.title,
      currentStepIndex: item.currentStepIndex,
      totalSteps: item.total,
      currentStepTitle,
      statusCounts: {
        todo: item.todo,
        in_progress: item.in_progress,
        done: item.done,
        blocked: item.blocked,
      },
    };
  });
}

/** GET /api/plans/active：进行中计划列表（无活跃计划返回 { plans: [] }） */
export async function GET() {
  return Response.json({ plans: buildActivePlanProjection(getActivePlans()) });
}
