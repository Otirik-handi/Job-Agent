'use client';
import type { ToolProgress } from './chat-panel';

export function ToolProgressCard({ progress }: { progress: ToolProgress }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-soft">
      <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
      <span>{progress.message}</span>
    </div>
  );
}
