'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from './api';

export type JobOpportunitySummary = {
  id: string; company: string; title: string; status: string; matched: boolean;
  createdAt: string; updatedAt: string;
};

export function useJobOpportunities(refreshSignal?: number) {
  const [jobs, setJobs] = useState<JobOpportunitySummary[]>([]);
  const refresh = useCallback(async () => {
    setJobs(await apiGet<JobOpportunitySummary[]>('/api/job-opportunities'));
  }, []);
  // refreshSignal：对话落库后由页面层递增，触发重新拉取（对话驱动资源变更同步到侧栏）
  useEffect(() => { void refresh(); }, [refresh, refreshSignal]);

  const remove = useCallback(async (id: string) => {
    await apiSend(`/api/job-opportunities/${id}`, 'DELETE');
    await refresh();
  }, [refresh]);

  return { jobs, refresh, remove };
}
