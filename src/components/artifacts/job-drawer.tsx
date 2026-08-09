'use client';
import { Briefcase, Download, FilePen, Globe, Mail } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/src/components/ui/sheet';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { EmptyState } from '@/src/components/ui/empty-state';
import { Separator } from '@/src/components/ui/separator';
import { MarkdownText } from '@/src/components/chat/markdown-text';
import { cn } from '@/src/lib/utils';
import { formatRelativeTime } from '@/src/lib/format-time';
import { useJobDetail } from '@/src/lib/use-job-detail';
import { useTailoredResumes } from '@/src/lib/use-tailored-resumes';
import { toInterviewPrepMarkdown } from '@/src/lib/interview-prep-md';

const LEVEL_LABELS: Record<string, string> = {
  'highly-matched': '高度匹配', matched: '匹配', partial: '部分匹配', mismatch: '不匹配',
};
const LEVEL_STYLES: Record<string, string> = {
  'highly-matched': 'bg-emerald-500/10 text-emerald-700',
  matched: 'bg-indigo-500/10 text-indigo-700',
  partial: 'bg-amber-500/10 text-amber-700',
  mismatch: 'bg-red-500/10 text-red-700',
};

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  official: '官方', job_board: '招聘平台', email: '邮箱', unknown: '未知',
};
const CHANNEL_TYPE_STYLES: Record<string, string> = {
  official: 'bg-indigo-500/10 text-indigo-700',
  job_board: 'bg-amber-500/10 text-amber-700',
  email: 'bg-emerald-500/10 text-emerald-700',
  unknown: 'bg-slate-100 text-slate-600',
};
const CHANNEL_VERIFY_LABELS: Record<string, string> = {
  verified: '已核验', needs_check: '需核验',
};
const CHANNEL_VERIFY_STYLES: Record<string, string> = {
  verified: 'bg-emerald-500/10 text-emerald-700',
  needs_check: 'bg-amber-500/10 text-amber-700',
};

export function JobDrawer({ jobId, open, refreshSignal, onOpenChange, onOpenTailored }: {
  jobId: string | null; open: boolean; refreshSignal?: number; onOpenChange: (open: boolean) => void;
  onOpenTailored: (id: string) => void;
}) {
  const { detail } = useJobDetail(open ? jobId : null, refreshSignal);
  const { items: tailored } = useTailoredResumes(open ? { jobOpportunityId: jobId ?? undefined } : undefined, refreshSignal);
  const fit = detail?.fitResult ?? null;
  const channels = detail?.channels?.channels ?? null;

  const handleExportPrep = () => {
    if (!detail?.interviewPrep) return;
    const md = toInterviewPrepMarkdown(detail.interviewPrep);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${detail.company || '岗位'}-${detail.title || '未知职位'}-面试准备.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:w-[40vw] data-[side=right]:sm:max-w-[40vw] overflow-y-auto p-6">
        <SheetHeader className="p-0">
          <SheetTitle>
            {detail ? (detail.company ? `${detail.company} · ${detail.title}` : '未命名岗位') : '岗位详情'}
          </SheetTitle>
          {detail && <div><StatusBadge status={detail.status} /></div>}
        </SheetHeader>
        {!detail && <p className="text-sm text-muted-foreground">加载中…</p>}
        {detail && !fit && (
          <EmptyState
            icon={Briefcase}
            title="尚未匹配"
            description="在对话中让 Agent 匹配这份岗位，结果会出现在这里"
            className="mt-8"
          />
        )}
        {detail && fit && (
          <div className="mt-4 space-y-5 text-sm">
            {/* 匹配评分 */}
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold">{fit.overallScore}</span>
              <span className="text-muted-foreground">/ 100 匹配评分</span>
            </div>
            {/* 岗位理解 */}
            <div>
              <p className="mb-2 font-medium">岗位理解</p>
              {fit.understanding.city && <p className="mb-1 text-sm text-muted-foreground">城市：{fit.understanding.city}</p>}
              {fit.understanding.level && <p className="mb-1 text-sm text-muted-foreground">职级：{fit.understanding.level}</p>}
              <ul className="space-y-1.5">
                {fit.understanding.requirements.map((r) => (
                  <li key={r.id} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">{r.id}</span>
                    <span>{r.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Separator />

            {/* 逐条匹配 */}
            <div>
              <p className="mb-2 font-medium">逐条匹配</p>
              <ul className="space-y-2.5">
                {fit.fitResults.map((f) => (
                  <li key={f.requirementId} className="rounded-2xl bg-slate-50 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{f.requirementId} · {f.note}</span>
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', LEVEL_STYLES[f.level])}>
                        {LEVEL_LABELS[f.level]}
                      </span>
                    </div>
                    <p className="mt-2 border-t border-slate-200/60 pt-2 text-xs italic leading-relaxed text-slate-500">
                      证据：{f.evidence}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <Separator />

            {/* 风险 */}
            {fit.risks.length > 0 && (
              <div>
                <p className="mb-1.5 font-medium">风险</p>
                <ul className="list-disc space-y-1 pl-5">
                  {fit.risks.map((r, i) => <li key={i}>{r.point}</li>)}
                </ul>
              </div>
            )}
            <Separator />

            {/* 投递建议 */}
            <div>
              <p className="mb-1.5 font-medium">投递建议</p>
              <div className="space-y-3">
                <div className="rounded-2xl bg-white p-3.5 shadow-soft">
                  <p className="mb-1 text-xs font-medium text-slate-500">必备修改</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">{fit.advice.mustFix.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
                <div className="rounded-2xl bg-white p-3.5 shadow-soft">
                  <p className="mb-1 text-xs font-medium text-slate-500">简历调整</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">{fit.advice.resumeAdjustments.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
                <div className="rounded-2xl bg-white p-3.5 shadow-soft">
                  <p className="mb-1 text-xs font-medium text-slate-500">谈话要点</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">{fit.advice.talkingPoints.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
                <div className="rounded-2xl bg-amber-500/5 p-3.5 text-sm text-slate-600">
                  <MarkdownText text={fit.advice.truthBoundary} />
                </div>
              </div>
            </div>
          </div>
        )}
        {detail && (
          <div className="mt-5 space-y-5 border-t border-slate-200/60 pt-5 text-sm">
            {/* 投递状态 */}
            <div>
              <p className="mb-2 font-medium">投递状态</p>
              <div className="flex items-center gap-2">
                <StatusBadge status={detail.status} />
                {detail.status === 'matched' && <span className="text-xs text-muted-foreground">可对助手说「投递该岗位」或「跳过该岗位」</span>}
                {detail.status === 'applying' && <span className="text-xs text-muted-foreground">可对助手说「已投递该岗位」完成投递</span>}
                {detail.status === 'applied' && <span className="text-xs text-muted-foreground">已投递，等待对方反馈</span>}
                {detail.status === 'skipped' && <span className="text-xs text-muted-foreground">已跳过，可随时重新匹配</span>}
                {detail.status === 'interview' && <span className="text-xs text-muted-foreground">可对助手说：记录面试结果（offer/拒绝）</span>}
                {detail.status === 'interview' && <span className="text-xs text-muted-foreground">可对助手说：准备这家公司的面试</span>}
                {detail.status === 'offer' && <span className="text-xs text-muted-foreground">可对助手说：接受 offer 入职</span>}
                {detail.status === 'rejected' && <span className="text-xs text-muted-foreground">已拒绝，可删除该岗位或匹配其他机会</span>}
                {detail.status === 'hired' && <span className="text-xs text-muted-foreground">已入职，此岗位已完结</span>}
              </div>
            </div>
            {/* 投递渠道 */}
            <div>
              <p className="mb-2 font-medium">投递渠道</p>
              {channels === null && <p className="text-muted-foreground">尚未发现渠道，可在对话中让 Agent 发现</p>}
              {channels && channels.length === 0 && <p className="text-muted-foreground">JD 中未发现可核验的投递渠道</p>}
              {channels && channels.length > 0 && (
                <ul className="space-y-2.5">
                  {channels.map((c) => (
                    <li key={c.id} className="rounded-2xl bg-slate-50 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', CHANNEL_TYPE_STYLES[c.type])}>
                            {CHANNEL_TYPE_LABELS[c.type]}
                          </span>
                          <span className="truncate font-medium">{c.label}</span>
                        </span>
                        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', CHANNEL_VERIFY_STYLES[c.verification])}>
                          {CHANNEL_VERIFY_LABELS[c.verification]}
                        </span>
                      </div>
                      {(c.url || c.email) && (
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {c.url && (
                            <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-indigo-600 hover:underline">
                              <Globe className="size-3 shrink-0" />
                              {c.url}
                            </a>
                          )}
                          {c.email && (
                            <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                              <Mail className="size-3 shrink-0" />
                              {c.email}
                            </a>
                          )}
                        </div>
                      )}
                      {c.riskSignals.length > 0 && (
                        <p className="mt-2 border-t border-slate-200/60 pt-2 text-xs text-amber-700">{c.riskSignals.join('；')}</p>
                      )}
                      {c.note && <p className="mt-1 text-xs italic text-slate-500">核验：{c.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Separator />
            {/* 专属简历 */}
            <div>
              <p className="mb-2 font-medium">专属简历</p>
              {tailored.length === 0 && (
                <p className="text-muted-foreground">尚未生成，可在对话中让 Agent 生成专属简历</p>
              )}
              {tailored.length > 0 && (
                <ul className="space-y-1.5">
                  {tailored.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => onOpenTailored(t.id)}
                        className="w-full rounded-xl bg-slate-50 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-100"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <FilePen className="size-3.5 shrink-0 text-violet-600" />
                            <span className="font-medium">v{t.version}</span>
                            <span className="truncate text-xs text-muted-foreground">{t.resumeName || '未知简历'}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(t.updatedAt)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Separator />
            {/* 面试准备 */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-medium">面试准备</p>
                {detail.interviewPrep && (
                  <button
                    onClick={handleExportPrep}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
                  >
                    <Download className="size-3.5" />
                    导出 Markdown
                  </button>
                )}
              </div>
              {!detail.interviewPrep && (
                <p className="text-muted-foreground">可在对话中让 Agent 准备面试</p>
              )}
              {detail.interviewPrep && (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-slate-50 p-3.5">
                    <p className="mb-1 text-xs font-medium text-slate-500">公司与岗位背景</p>
                    <p className="text-sm">{detail.interviewPrep.companyBrief}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3.5">
                    <p className="mb-1 text-xs font-medium text-slate-500">自我介绍</p>
                    <p className="text-sm">{detail.interviewPrep.selfIntro}</p>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-500">预测面试问题</p>
                    <ul className="space-y-2.5">
                      {detail.interviewPrep.questions.map((q) => (
                        <li key={q.id} className="rounded-2xl bg-slate-50 p-3.5">
                          <p className="font-medium">{q.id} · {q.question}</p>
                          <p className="mt-1 text-xs text-muted-foreground">考察意图：{q.intent}</p>
                          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm">
                            {q.answerPoints.map((p, i) => <li key={i}>{p}</li>)}
                          </ul>
                          {q.evidence && (
                            <p className="mt-2 border-t border-slate-200/60 pt-2 text-xs italic leading-relaxed text-slate-500">
                              简历证据：{q.evidence}
                            </p>
                          )}
                          {q.risk && (
                            <p className="mt-1 text-xs text-amber-700">风险提示：{q.risk}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {detail.interviewPrep.askThem.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-slate-500">向面试官提问</p>
                      <ul className="list-disc space-y-0.5 pl-5 text-sm">
                        {detail.interviewPrep.askThem.map((q, i) => <li key={i}>{q}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
