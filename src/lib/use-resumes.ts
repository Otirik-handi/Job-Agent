'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from './api';

export type ResumeSummary = {
  id: string; name: string; sourceType: string; analyzed: boolean;
  createdAt: string; updatedAt: string;
};

export function useResumes() {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const refresh = useCallback(async () => {
    setResumes(await apiGet<ResumeSummary[]>('/api/resumes'));
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await apiSend(`/api/resumes/${id}`, 'DELETE');
    await refresh();
  }, [refresh]);

  return { resumes, refresh, remove };
}
