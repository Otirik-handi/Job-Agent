'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from './api';

export type JobOpportunitySummary = {
  id: string; company: string; title: string; status: string; matched: boolean;
  createdAt: string; updatedAt: string;
};

export function useJobOpportunities() {
  const [jobs, setJobs] = useState<JobOpportunitySummary[]>([]);
  const refresh = useCallback(async () => {
    setJobs(await apiGet<JobOpportunitySummary[]>('/api/job-opportunities'));
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await apiSend(`/api/job-opportunities/${id}`, 'DELETE');
    await refresh();
  }, [refresh]);

  return { jobs, refresh, remove };
}
