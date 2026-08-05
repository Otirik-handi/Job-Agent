'use client';
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { useResumes } from '@/src/lib/use-resumes';
import { useJobOpportunities } from '@/src/lib/use-job-opportunities';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { Button } from '@/src/components/ui/button';
import { apiUpload } from '@/src/lib/api';

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

export function ResourceTabs({
  onOpenResume,
  onOpenJob,
}: {
  onOpenResume: (id: string) => void;
  onOpenJob: (id: string) => void;
}) {
  const [tab, setTab] = useState<'resume' | 'job'>('resume');
  const { resumes, refresh } = useResumes();
  const { jobs } = useJobOpportunities();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选择同一文件
    if (!file) return;
    setNotice(null);
    if (!/\.(pdf|docx|txt|md)$/i.test(file.name)) {
      setNotice({ kind: 'err', text: '不支持的文件格式：仅支持 PDF / DOCX / TXT / MD' });
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      setNotice({ kind: 'err', text: '文件超过 5MB 上限' });
      return;
    }
    setUploading(true);
    try {
      const r = await apiUpload<{ name: string }>('/api/resumes/upload', file);
      setNotice({ kind: 'ok', text: `已导入《${r.name}》，可在对话中让 Agent 分析` });
      void refresh();
    } catch (err) {
      setNotice({ kind: 'err', text: err instanceof Error ? err.message : '上传失败' });
    } finally {
      setUploading(false);
    }
  };

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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              {uploading ? '解析中…' : '上传简历'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={handleFile}
            />
          </div>
          {notice && (
            <div role="status" className={`rounded-2xl px-3 py-2 text-xs ${notice.kind === 'ok' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>
              {notice.text}
            </div>
          )}
          {resumes.length === 0 && (
            <div className="rounded-2xl bg-slate-100/60 px-3 py-6 text-center text-xs text-muted-foreground">
              暂无简历，可上传文件（PDF / DOCX / TXT / MD）或在对话中粘贴文本导入
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
