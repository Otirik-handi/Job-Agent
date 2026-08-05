'use client';
import { useResumes } from '@/src/lib/use-resumes';

export function ResourceTabs({ onOpenResume }: { onOpenResume: (id: string) => void }) {
  const { resumes } = useResumes();
  return (
    <div className="flex h-full flex-col gap-1.5 p-3">
      <div className="flex gap-1 text-xs text-muted-foreground">
        <span className="rounded-full bg-slate-100 px-3 py-1">简历</span>
        <span className="px-3 py-1">岗位（第 2 期）</span>
        <span className="px-3 py-1">专属简历（第 3 期）</span>
      </div>
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
    </div>
  );
}
