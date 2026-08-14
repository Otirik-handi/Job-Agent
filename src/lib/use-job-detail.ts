'use client';
import { useEffect, useState } from 'react';
import { apiGet } from './api';

export type JobDetail = {
  id: string; company: string; title: string; jdText: string; url: string | null;
  status: string;
  fitResult: {
    schemaVersion: number; overallScore: number;
    understanding: { company: string; title: string; requirements: Array<{ id: string; text: string; type: string; classification?: string }>; city: string | null; level: string | null; tags: string[] };
    fitResults: Array<{ requirementId: string; level: 'highly-matched' | 'matched' | 'partial' | 'mismatch'; evidence: string; note: string }>;
    fitBand?: 'overqualified' | 'excellent' | 'good' | 'stretch' | 'underqualified';
    redFlags?: Array<{ category: 'workload' | 'culture' | 'compensation'; phrase: string; label: string }>;
    keywordMatchScore?: number;
    missingKeywords?: Array<{ term: string; type: string }>;
    risks: Array<{ point: string; evidence?: string }>;
    advice: { mustFix: string[]; resumeAdjustments: string[]; talkingPoints: string[]; truthBoundary: string };
  } | null;
  channels: {
    schemaVersion: number;
    channels: Array<{
      id: string; type: 'official' | 'job_board' | 'email' | 'unknown';
      label: string; url: string | null; email: string | null;
      riskSignals: string[]; verification: 'verified' | 'needs_check'; note: string;
    }>;
  } | null;
  interviewPrep: {
    schemaVersion: number; companyBrief: string; selfIntro: string;
    questions: Array<{ id: string; question: string; intent: string; answerPoints: string[]; evidence: string | null; risk: string | null; probability?: 'high' | 'medium' | 'low' }>;
    redFlags?: string[];
    askThem: string[];
  } | null;
  appliedTailoredResume: { id: string; version: number; createdAt: string } | null;
  createdAt: string; updatedAt: string;
};

export function useJobDetail(id: string | null, refreshSignal?: number) {
  const [detail, setDetail] = useState<JobDetail | null>(null);
  useEffect(() => {
    setDetail(null);
    if (!id) return;
    void apiGet<JobDetail>(`/api/job-opportunities/${id}`).then(setDetail).catch(() => setDetail(null));
  }, [id, refreshSignal]);
  return { detail };
}
