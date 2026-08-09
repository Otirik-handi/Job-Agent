'use client';
import { useEffect, useState } from 'react';
import { FilePen, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/src/components/ui/sheet';
import { EmptyState } from '@/src/components/ui/empty-state';
import { ConfirmDialog } from '@/src/components/ui/confirm-dialog';
import { MarkdownText } from '@/src/components/chat/markdown-text';
import { cn } from '@/src/lib/utils';
import { useTailoredResumeDetail } from '@/src/lib/use-tailored-resume-detail';
import { useTailoredResumes } from '@/src/lib/use-tailored-resumes';

/** 专属简历抽屉：Markdown 预览 + 同岗位版本切换 + 删除 */
export function TailoredResumeDrawer({ tailoredResumeId, open, refreshSignal, onOpenChange, onDeleted }: {
  tailoredResumeId: string | null; open: boolean; refreshSignal?: number; onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(tailoredResumeId);
  useEffect(() => { setSelectedId(tailoredResumeId); }, [tailoredResumeId]);

  const { detail } = useTailoredResumeDetail(open ? selectedId : null, refreshSignal);
  const { items, remove } = useTailoredResumes(detail ? { jobOpportunityId: detail.jobOpportunityId } : undefined, refreshSignal);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!selectedId) return;
    setConfirmDelete(false);
    const deletedId = selectedId;
    await remove(deletedId);
    onDeleted(deletedId);
  };

  const title = detail
    ? `${detail.jobCompany || '未命名岗位'}${detail.jobTitle ? ` · ${detail.jobTitle}` : ''}`
    : '专属简历';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:w-[40vw] data-[side=right]:sm:max-w-[40vw] overflow-y-auto p-6">
        <SheetHeader className="p-0">
          <SheetTitle>{title}</SheetTitle>
          {detail && <p className="text-xs text-muted-foreground">{detail.resumeName || '未知简历'} · v{detail.version} · {new Date(detail.updatedAt).toLocaleString('zh-CN')}</p>}
        </SheetHeader>
        {!detail && <p className="text-sm text-muted-foreground">加载中…</p>}
        {detail && (
          <div className="mt-4 space-y-4">
            {/* 版本切换 */}
            {items.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {items.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedId(v.id)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                      v.id === selectedId
                        ? 'bg-indigo-500/10 text-indigo-700'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                    )}
                  >
                    v{v.version}
                  </button>
                ))}
              </div>
            )}
            {/* Markdown 预览 */}
            <div className="rounded-2xl bg-white p-4 shadow-soft">
              <MarkdownText text={detail.contentMarkdown} />
            </div>
            {/* 删除操作 */}
            <div className="flex justify-end">
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <Trash2 className="size-3.5" />
                删除该版本
              </button>
            </div>
          </div>
        )}
        {detail && items.length === 0 && (
          <EmptyState
            icon={FilePen}
            title="版本已被删除"
            description="该岗位暂无其他专属简历版本"
            className="mt-8"
          />
        )}
        <ConfirmDialog
          open={confirmDelete}
          title="删除专属简历版本"
          description="确定要删除该版本吗？此操作不可恢复。"
          confirmText="删除"
          onOpenChange={(o) => { if (!o) setConfirmDelete(false); }}
          onConfirm={handleDelete}
        />
      </SheetContent>
    </Sheet>
  );
}
