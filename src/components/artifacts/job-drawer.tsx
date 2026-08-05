'use client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/src/components/ui/sheet';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { Separator } from '@/src/components/ui/separator';
import { MarkdownText } from '@/src/components/chat/markdown-text';
import { cn } from '@/src/lib/utils';
import { useJobDetail } from '@/src/lib/use-job-detail';

const LEVEL_LABELS: Record<string, string> = {
  'highly-matched': '高度匹配', matched: '匹配', partial: '部分匹配', mismatch: '不匹配',
};
const LEVEL_STYLES: Record<string, string> = {
  'highly-matched': 'bg-emerald-500/10 text-emerald-700',
  matched: 'bg-indigo-500/10 text-indigo-700',
  partial: 'bg-amber-500/10 text-amber-700',
  mismatch: 'bg-red-500/10 text-red-700',
};

export function JobDrawer({ jobId, open, onOpenChange }: {
  jobId: string | null; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { detail } = useJobDetail(open ? jobId : null);
  const fit = detail?.fitResult ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[40vw] sm:max-w-[40vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {detail ? (detail.company ? `${detail.company} · ${detail.title}` : '未命名岗位') : '岗位详情'}
          </SheetTitle>
          {detail && <div><StatusBadge status={detail.status} /></div>}
        </SheetHeader>
        {!detail && <p className="text-sm text-muted-foreground">加载中…</p>}
        {detail && !fit && (
          <p className="mt-4 text-sm text-muted-foreground">尚未匹配，可在对话中让 Agent 匹配这份岗位。</p>
        )}
        {detail && fit && (
          <div className="mt-4 space-y-5 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold">{fit.overallScore}</span>
              <span className="text-muted-foreground">/ 100 匹配评分</span>
            </div>

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

            {fit.risks.length > 0 && (
              <div>
                <p className="mb-1.5 font-medium">风险</p>
                <ul className="list-disc space-y-1 pl-5">
                  {fit.risks.map((r, i) => <li key={i}>{r.point}</li>)}
                </ul>
              </div>
            )}
            <Separator />

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
      </SheetContent>
    </Sheet>
  );
}
