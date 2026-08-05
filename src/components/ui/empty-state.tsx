import type { LucideIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-10 text-center', className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-pink-100',
          compact ? 'size-10' : 'size-14',
        )}
      >
        <Icon className={compact ? 'size-5 text-indigo-500' : 'size-6 text-indigo-500'} />
      </div>
      <p className={cn('font-medium text-slate-700', compact ? 'text-xs' : 'text-sm')}>{title}</p>
      {description && (
        <p className={cn('max-w-60 leading-relaxed text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
