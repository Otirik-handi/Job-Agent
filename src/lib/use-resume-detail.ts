'use client';
import { useEffect, useState } from 'react';
import { apiGet } from './api';

export type ResumeDetail = {
  id: string; name: string; sourceType: string; sourceText: string;
  analysis: {
    schemaVersion: number; overallScore: number;
    strengths: Array<{ point: string; evidence?: string }>;
    risks: Array<{ point: string; evidence?: string }>;
    improvements: Array<{ suggestion: string; priority: 'high' | 'medium' | 'low' }>;
    profile: { skills: string[]; experienceYears: number | null; targetRoles: string[]; targetCities: string[] };
    pendingConfirmations: string[];
  } | null;
  createdAt: string; updatedAt: string;
};

export function useResumeDetail(id: string | null, refreshSignal?: number) {
  const [detail, setDetail] = useState<ResumeDetail | null>(null);
  useEffect(() => {
    setDetail(null);
    if (!id) return;
    void apiGet<ResumeDetail>(`/api/resumes/${id}`).then(setDetail).catch(() => setDetail(null));
  }, [id, refreshSignal]);
  return { detail };
}
