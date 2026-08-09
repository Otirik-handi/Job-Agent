'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiSend } from './api';

export type TailoredResumeSummary = {
  id: string; resumeId: string; jobOpportunityId: string; version: number;
  jobCompany: string; jobTitle: string; resumeName: string;
  createdAt: string; updatedAt: string;
};

export function useTailoredResumes(filter?: { jobOpportunityId?: string; resumeId?: string }, refreshSignal?: number) {
  const [items, setItems] = useState<TailoredResumeSummary[]>([]);
  const jobOpportunityId = filter?.jobOpportunityId;
  const resumeId = filter?.resumeId;
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (jobOpportunityId) params.set('jobOpportunityId', jobOpportunityId);
    if (resumeId) params.set('resumeId', resumeId);
    const s = params.toString();
    return s ? `?${s}` : '';
  }, [jobOpportunityId, resumeId]);
  const refresh = useCallback(async () => {
    setItems(await apiGet<TailoredResumeSummary[]>(`/api/tailored-resumes${query}`));
  }, [query]);
  // refreshSignal：对话落库后由页面层递增，触发重新拉取（对话驱动资源变更同步到侧栏）
  useEffect(() => { void refresh(); }, [refresh, refreshSignal]);

  const remove = useCallback(async (id: string) => {
    await apiSend(`/api/tailored-resumes/${id}`, 'DELETE');
    await refresh();
  }, [refresh]);

  return { items, refresh, remove };
}
