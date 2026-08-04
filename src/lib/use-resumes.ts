'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';

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
  return { resumes, refresh };
}
