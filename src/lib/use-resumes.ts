'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from './api';

export type ResumeSummary = {
  id: string; name: string; sourceType: string; analyzed: boolean;
  createdAt: string; updatedAt: string;
};

export function useResumes(refreshSignal?: number) {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const refresh = useCallback(async () => {
    setResumes(await apiGet<ResumeSummary[]>('/api/resumes'));
  }, []);
  // refreshSignal：对话落库后由页面层递增，触发重新拉取（对话驱动资源变更同步到侧栏）
  useEffect(() => { void refresh(); }, [refresh, refreshSignal]);

  const remove = useCallback(async (id: string) => {
    await apiSend(`/api/resumes/${id}`, 'DELETE');
    await refresh();
  }, [refresh]);

  const rename = useCallback(async (id: string, name: string) => {
    await apiSend(`/api/resumes/${id}`, 'PATCH', { name });
    await refresh();
  }, [refresh]);

  return { resumes, refresh, remove, rename };
}
