'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';

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
  return { jobs, refresh };
}
