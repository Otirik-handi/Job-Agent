'use client';
import { useEffect, useState } from 'react';
import { apiGet } from './api';

export type JobDetail = {
  id: string; company: string; title: string; jdText: string; url: string | null;
  status: string;
  fitResult: {
    schemaVersion: number; overallScore: number;
    understanding: { company: string; title: string; requirements: Array<{ id: string; text: string; type: string }>; city: string | null; level: string | null; tags: string[] };
    fitResults: Array<{ requirementId: string; level: 'highly-matched' | 'matched' | 'partial' | 'mismatch'; evidence: string; note: string }>;
    risks: Array<{ point: string; evidence?: string }>;
    advice: { mustFix: string[]; resumeAdjustments: string[]; talkingPoints: string[]; truthBoundary: string };
  } | null;
  createdAt: string; updatedAt: string;
};

export function useJobDetail(id: string | null) {
  const [detail, setDetail] = useState<JobDetail | null>(null);
  useEffect(() => {
    setDetail(null);
    if (!id) return;
    void apiGet<JobDetail>(`/api/job-opportunities/${id}`).then(setDetail).catch(() => setDetail(null));
  }, [id]);
  return { detail };
}
