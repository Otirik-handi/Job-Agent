'use client';
import { useResumes } from '@/src/lib/use-resumes';

export function ResourceTabs({ onOpenResume }: { onOpenResume: (id: string) => void }) {
  const { resumes } = useResumes();
  return (
    <div className="flex h-full flex-col gap-1 p-2">
      <div className="flex gap-1 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-2 py-1">简历</span>
        <span className="px-2 py-1">岗位（第 2 期）</span>
        <span className="px-2 py-1">专属简历（第 3 期）</span>
      </div>
      {resumes.length === 0 && (
        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
          暂无简历，可在对话中粘贴文本或提供文件路径导入
        </p>
      )}
      {resumes.map((r) => (
        <button
          key={r.id}
          onClick={() => onOpenResume(r.id)}
          className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
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
