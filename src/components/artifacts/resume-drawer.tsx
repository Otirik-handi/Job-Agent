'use client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/src/components/ui/sheet';
import { Badge } from '@/src/components/ui/badge';
import { Separator } from '@/src/components/ui/separator';
import { useResumeDetail } from '@/src/lib/use-resume-detail';

export function ResumeDrawer({ resumeId, open, onOpenChange }: {
  resumeId: string | null; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { detail } = useResumeDetail(open ? resumeId : null);
  const analysis = detail?.analysis ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{detail?.name ?? '简历详情'}</SheetTitle>
        </SheetHeader>
        {!detail && <p className="text-sm text-muted-foreground">加载中…</p>}
        {detail && !analysis && (
          <p className="mt-4 text-sm text-muted-foreground">尚未分析，可在对话中让 Agent 分析这份简历。</p>
        )}
        {detail && analysis && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">{analysis.overallScore}</span>
              <span className="text-muted-foreground">/ 100 综合评分</span>
            </div>
            <div>
              <p className="mb-1 font-medium">技能</p>
              <div className="flex flex-wrap gap-1">
                {analysis.profile.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
              </div>
            </div>
            <div>
              <p className="mb-1 font-medium">优势</p>
              <ul className="list-disc space-y-1 pl-4">
                {analysis.strengths.map((s, i) => (
                  <li key={i}>{s.point}{s.evidence ? <span className="text-muted-foreground">（{s.evidence}）</span> : null}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-medium">风险 / 短板</p>
              <ul className="list-disc space-y-1 pl-4">
                {analysis.risks.map((r, i) => <li key={i}>{r.point}</li>)}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-medium">改进建议</p>
              <ul className="list-disc space-y-1 pl-4">
                {analysis.improvements.map((im, i) => (
                  <li key={i}>
                    <span className={im.priority === 'high' ? 'font-medium' : undefined}>{im.suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
            {analysis.pendingConfirmations.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="mb-1 font-medium">待确认项</p>
                  <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                    {analysis.pendingConfirmations.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
