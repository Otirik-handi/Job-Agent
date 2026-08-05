import { cn } from '@/src/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  saved: 'bg-slate-100 text-slate-600',
  matched: 'bg-indigo-500/10 text-indigo-700',
  applying: 'bg-amber-500/10 text-amber-700',
  applied: 'bg-emerald-500/10 text-emerald-700',
  skipped: 'bg-slate-100 text-slate-500',
};

const STATUS_LABELS: Record<string, string> = {
  saved: '已保存', matched: '已匹配', applying: '投递中', applied: '已投递', skipped: '已跳过',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600')}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
