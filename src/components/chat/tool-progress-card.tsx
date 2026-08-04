'use client';
import type { ToolProgress } from './chat-panel';

export function ToolProgressCard({ progress }: { progress: ToolProgress }) {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground">
      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
      <span>{progress.message}</span>
    </div>
  );
}
