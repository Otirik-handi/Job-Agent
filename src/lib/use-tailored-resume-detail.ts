'use client';
import { useEffect, useState } from 'react';
import { apiGet } from './api';

export type TailoredResumeDetail = {
  id: string; resumeId: string; jobOpportunityId: string; version: number;
  contentMarkdown: string; jobCompany: string; jobTitle: string; resumeName: string;
  createdAt: string; updatedAt: string;
};

export function useTailoredResumeDetail(id: string | null, refreshSignal?: number) {
  const [detail, setDetail] = useState<TailoredResumeDetail | null>(null);
  useEffect(() => {
    setDetail(null);
    if (!id) return;
    void apiGet<TailoredResumeDetail>(`/api/tailored-resumes/${id}`).then(setDetail).catch(() => setDetail(null));
  }, [id, refreshSignal]);
  return { detail };
}
