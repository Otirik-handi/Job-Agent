'use client';
import { useRef, useState } from 'react';
import { Briefcase, FilePen, FileText, Trash2, Upload } from 'lucide-react';
import { useResumes } from '@/src/lib/use-resumes';
import { useJobOpportunities } from '@/src/lib/use-job-opportunities';
import { useTailoredResumes } from '@/src/lib/use-tailored-resumes';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { Button } from '@/src/components/ui/button';
import { ConfirmDialog } from '@/src/components/ui/confirm-dialog';
import { EmptyState } from '@/src/components/ui/empty-state';
import { apiUpload } from '@/src/lib/api';
import { formatRelativeTime } from '@/src/lib/format-time';

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

export function ResourceTabs({
  onOpenResume,
  onOpenJob,
  onOpenTailored,
  onDeletedResume,
  onDeletedJob,
  onDeletedTailored,
}: {
  onOpenResume: (id: string) => void;
  onOpenJob: (id: string) => void;
  onOpenTailored: (id: string) => void;
  onDeletedResume: (id: string) => void;
  onDeletedJob: (id: string) => void;
  onDeletedTailored: (id: string) => void;
}) {
  const [tab, setTab] = useState<'resume' | 'job' | 'tailored'>('resume');
  const { resumes, refresh, remove: removeResume } = useResumes();
  const { jobs, remove: removeJob } = useJobOpportunities();
  const { items: tailored, remove: removeTailored } = useTailoredResumes();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'resume' | 'job' | 'tailored'; id: string; name: string } | null>(null);

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
      setNotice({ kind: 'err', text: `文件超过 ${MAX_UPLOAD_SIZE / (1024 * 1024)}MB 上限` });
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

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { kind, id } = deleteTarget;
    setDeleteTarget(null);
    if (kind === 'resume') {
      await removeResume(id);
      onDeletedResume(id);
    } else if (kind === 'job') {
      await removeJob(id);
      onDeletedJob(id);
    } else {
      await removeTailored(id);
      onDeletedTailored(id);
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
        <span
          onClick={() => setTab('tailored')}
          className={`cursor-pointer rounded-full px-3 py-1 transition-colors hover:bg-slate-100 ${tab === 'tailored' ? 'bg-slate-100' : ''}`}
        >
          专属简历
        </span>
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
            <EmptyState
              compact
              icon={FileText}
              title="暂无简历"
              description="上传 PDF / DOCX / TXT / MD，或在对话中粘贴文本导入"
              className="rounded-2xl bg-slate-100/60 px-3 py-6"
            />
          )}
          {resumes.map((r) => (
            <div key={r.id} className="group relative rounded-xl transition-all hover:bg-slate-100">
              <div
                onClick={() => onOpenResume(r.id)}
                className="cursor-pointer px-3 py-2 text-left text-sm"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/10">
                      <FileText className="size-3.5 text-indigo-600" />
                    </span>
                    <span className="truncate">{r.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ kind: 'resume', id: r.id, name: r.name }); }}
                      className="rounded-md p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600"
                      aria-label={`删除简历 ${r.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {r.analyzed ? '已分析' : '未分析'} · {r.sourceType}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(r.updatedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
      {tab === 'job' && (
        <>
          {jobs.length === 0 && (
            <EmptyState
              compact
              icon={Briefcase}
              title="暂无岗位"
              description="在对话中粘贴 JD，即可导入并匹配"
              className="rounded-2xl bg-slate-100/60 px-3 py-6"
            />
          )}
          {jobs.map((job) => (
            <div key={job.id} className="group relative rounded-xl transition-all hover:bg-slate-100">
              <div
                onClick={() => onOpenJob(job.id)}
                className="cursor-pointer px-3 py-2 text-left text-sm"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                      <Briefcase className="size-3.5 text-emerald-600" />
                    </span>
                    <span className="truncate">{job.company ? `${job.company} · ${job.title}` : '未命名岗位'}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ kind: 'job', id: job.id, name: job.company ? `${job.company} · ${job.title}` : '未命名岗位' }); }}
                      className="rounded-md p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600"
                      aria-label="删除岗位"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <StatusBadge status={job.status} />
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(job.updatedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
      {tab === 'tailored' && (
        <>
          {tailored.length === 0 && (
            <EmptyState
              compact
              icon={FilePen}
              title="暂无专属简历"
              description="在对话中让助手为已匹配的岗位生成专属简历"
              className="rounded-2xl bg-slate-100/60 px-3 py-6"
            />
          )}
          {tailored.map((t) => (
            <div key={t.id} className="group relative rounded-xl transition-all hover:bg-slate-100">
              <div
                onClick={() => onOpenTailored(t.id)}
                className="cursor-pointer px-3 py-2 text-left text-sm"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
                      <FilePen className="size-3.5 text-violet-600" />
                    </span>
                    <span className="truncate">{t.jobCompany ? `${t.jobCompany} · ${t.jobTitle}` : '未命名岗位'}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ kind: 'tailored', id: t.id, name: `${t.jobCompany || '未命名岗位'} · v${t.version}` }); }}
                      className="rounded-md p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600"
                      aria-label="删除专属简历"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">{t.resumeName || '未知简历'} · v{t.version}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(t.updatedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.kind === 'resume' ? '删除简历' : deleteTarget?.kind === 'job' ? '删除岗位' : '删除专属简历'}
        description={deleteTarget ? `确定要删除「${deleteTarget.name}」吗？此操作不可恢复。` : ''}
        confirmText="删除"
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
