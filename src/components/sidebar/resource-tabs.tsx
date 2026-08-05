'use client';
import { useState } from 'react';
import { useResumes } from '@/src/lib/use-resumes';
import { useJobOpportunities } from '@/src/lib/use-job-opportunities';
import { StatusBadge } from '@/src/components/ui/status-badge';

export function ResourceTabs({
  onOpenResume,
  onOpenJob,
}: {
  onOpenResume: (id: string) => void;
  onOpenJob: (id: string) => void;
}) {
  const [tab, setTab] = useState<'resume' | 'job'>('resume');
  const { resumes } = useResumes();
  const { jobs } = useJobOpportunities();
  return (
    <div className="flex h-full flex-col gap-1.5 p-3">
      <div className="flex gap-1 text-xs text-muted-foreground">
        <span
          onClick={() => setTab('resume')}
          className={`cursor-pointer rounded-full px-3 py-1 transition-colors hover:bg-slate-100 ${tab === 'resume' ? 'bg-slate-100' : ''}`}
        >
          简历
        </span>
        <span
          onClick={() => setTab('job')}
          className={`cursor-pointer rounded-full px-3 py-1 transition-colors hover:bg-slate-100 ${tab === 'job' ? 'bg-slate-100' : ''}`}
        >
          岗位
        </span>
        <span className="px-3 py-1">专属简历（第 3 期）</span>
      </div>
      {tab === 'resume' && (
        <>
          {resumes.length === 0 && (
            <div className="rounded-2xl bg-slate-100/60 px-3 py-6 text-center text-xs text-muted-foreground">
              暂无简历，可在对话中粘贴文本或提供文件路径导入
            </div>
          )}
          {resumes.map((r) => (
            <button
              key={r.id}
              onClick={() => onOpenResume(r.id)}
              className="rounded-xl px-3 py-2 text-left text-sm transition-all hover:bg-slate-100"
            >
              <div className="truncate">{r.name}</div>
              <div className="text-xs text-muted-foreground">
                {r.analyzed ? '已分析' : '未分析'} · {r.sourceType}
              </div>
            </button>
          ))}
        </>
      )}
      {tab === 'job' && (
        <>
          {jobs.length === 0 && (
            <div className="rounded-2xl bg-slate-100/60 px-3 py-6 text-center text-xs text-muted-foreground">
              暂无岗位，可在对话中粘贴 JD 导入
            </div>
          )}
          {jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => onOpenJob(job.id)}
              className="rounded-xl px-3 py-2 text-left text-sm transition-all hover:bg-slate-100"
            >
              <div className="truncate">{job.company ? `${job.company} · ${job.title}` : '未命名岗位'}</div>
              <div className="mt-0.5 flex items-center gap-2">
                <StatusBadge status={job.status} />
                <span className="text-xs text-muted-foreground">{new Date(job.updatedAt).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
