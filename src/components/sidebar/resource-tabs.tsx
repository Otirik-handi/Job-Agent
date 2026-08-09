'use client';
import { useLayoutEffect, useRef, useState } from 'react';
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
  const [jobFilter, setJobFilter] = useState<'all' | 'matched' | 'applying' | 'applied' | 'skipped' | 'interview' | 'offer' | 'hired' | 'rejected'>('all');
  // 滑动指示器：跟随选中 Tab 的位置与宽度（useLayoutEffect 避免首帧闪烁）
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const bar = tabBarRef.current;
    const active = bar?.querySelector<HTMLElement>(`[data-resource-tab="${tab}"]`);
    if (bar && active) setIndicator({ x: active.offsetLeft, w: active.offsetWidth });
  }, [tab]);
  const { resumes, refresh, remove: removeResume } = useResumes();
  const { jobs, remove: removeJob } = useJobOpportunities();
  const { items: tailored, refresh: refreshTailored, remove: removeTailored } = useTailoredResumes();
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
      void refreshTailored(); // 级联删除关联专属简历，列表需同步刷新
    } else if (kind === 'job') {
      await removeJob(id);
      onDeletedJob(id);
      void refreshTailored(); // 级联删除关联专属简历，列表需同步刷新
    } else {
      await removeTailored(id);
      onDeletedTailored(id);
    }
  };

  return (
    <div className="flex h-full flex-col gap-1.5 p-3">
      <div ref={tabBarRef} className="relative flex gap-1 text-xs text-muted-foreground">
        {/* 滑动指示器：主色胶囊，translateX + width 过渡实现滑动切换 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-indigo-600 shadow-soft transition-all duration-300 ease-out"
          style={{ width: indicator.w || undefined, transform: `translateX(${indicator.x}px)` }}
        />
        <span
          data-resource-tab="resume"
          onClick={() => setTab('resume')}
          className={`relative z-10 cursor-pointer rounded-full px-3 py-1 transition-colors ${tab === 'resume' ? 'text-white' : 'hover:bg-slate-100'}`}
        >
          简历
        </span>
        <span
          data-resource-tab="job"
          onClick={() => setTab('job')}
          className={`relative z-10 cursor-pointer rounded-full px-3 py-1 transition-colors ${tab === 'job' ? 'text-white' : 'hover:bg-slate-100'}`}
        >
          岗位
        </span>
        <span
          data-resource-tab="tailored"
          onClick={() => setTab('tailored')}
          className={`relative z-10 cursor-pointer rounded-full px-3 py-1 transition-colors ${tab === 'tailored' ? 'text-white' : 'hover:bg-slate-100'}`}
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
          <div className="flex flex-wrap gap-1 px-3 pb-1 text-xs">
            {(['all', 'matched', 'applying', 'applied', 'skipped', 'interview', 'offer', 'hired', 'rejected'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setJobFilter(f)}
                className={`rounded-full px-2.5 py-1 transition-colors ${jobFilter === f ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-slate-100'}`}
              >
                {{ all: '全部', matched: '已匹配', applying: '投递中', applied: '已投递', skipped: '已跳过', interview: '面试中', offer: 'offer', hired: '已入职', rejected: '已拒绝' }[f]}
              </button>
            ))}
          </div>
          {jobs.length === 0 && (
            <EmptyState
              compact
              icon={Briefcase}
              title="暂无岗位"
              description="在对话中粘贴 JD，即可导入并匹配"
              className="rounded-2xl bg-slate-100/60 px-3 py-6"
            />
          )}
          {jobs.filter((job) => jobFilter === 'all' || job.status === jobFilter).map((job) => (
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
