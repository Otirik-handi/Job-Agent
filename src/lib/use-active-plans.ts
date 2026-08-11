'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';

/** 活跃计划进度（与 app/api/plans/active 返回结构一致） */
export type ActivePlanProgress = {
  taskId: string;
  title: string;
  /** 当前进行中步骤索引（第一个 in_progress，0-based）；无则为 null */
  currentStepIndex: number | null;
  totalSteps: number;
  /** 当前进行中步骤标题 */
  currentStepTitle: string | null;
  statusCounts: { todo: number; in_progress: number; done: number; blocked: number };
};

/**
 * 活跃计划进度 hook（规划进度联动，规范见 frontend-conventions.md「规划进度联动」）：
 * 挂载时拉一次；refreshSignal（对话区消息流结束计数）递增后刷新，
 * 与计划文件这一进度单一事实来源对齐。加载失败静默降级——进度显示为可选增强，
 * 不阻塞对话。
 */
export function useActivePlans(refreshSignal?: number) {
  const [plans, setPlans] = useState<ActivePlanProgress[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await apiGet<{ plans: ActivePlanProgress[] }>('/api/plans/active');
      setPlans(res.plans);
    } catch (err) {
      console.error('活跃计划加载失败', err);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshSignal]);

  return { plans, refresh };
}
