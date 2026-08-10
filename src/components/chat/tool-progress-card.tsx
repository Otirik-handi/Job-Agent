'use client';
import type { ToolProgress } from './chat-panel';
import { cn } from '@/src/lib/utils';

/** 工具进度卡片：运行中显示脉冲指示点；失败（含业务失败 {ok:false,error}）显示红色失败态 */
export function ToolProgressCard({ progress }: { progress: ToolProgress }) {
  const failed = progress.status === 'failed';
  return (
    <div
      className={cn(
        'mb-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm shadow-soft',
        failed ? 'bg-red-500/5 text-red-600' : 'bg-white text-slate-600',
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          failed ? 'bg-red-500' : 'animate-pulse bg-indigo-500',
        )}
      />
      <span>{progress.message}</span>
    </div>
  );
}
