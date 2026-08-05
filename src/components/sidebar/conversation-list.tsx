'use client';
import { Button } from '@/src/components/ui/button';
import { cn } from '@/src/lib/utils';
import type { ConversationSummary } from '@/src/lib/use-conversations';

export function ConversationList({
  conversations, activeId, onSelect, onNew,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-1.5 p-3">
      <Button size="sm" variant="outline" className="mb-1" onClick={onNew}>＋ 新对话</Button>
      {conversations.length === 0 && (
        <div className="rounded-2xl bg-slate-100/60 px-3 py-6 text-center text-xs text-muted-foreground">暂无会话</div>
      )}
      {conversations.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={cn(
            'rounded-xl px-3 py-2 text-left text-sm transition-all hover:bg-slate-100',
            c.id === activeId && 'bg-slate-100 font-medium shadow-soft',
          )}
        >
          <div className="relative pl-2">
            {c.id === activeId && (
              <span className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-indigo-500" />
            )}
            <div className="truncate">{c.title}</div>
            {c.lastMessagePreview && (
              <div className="truncate text-xs text-muted-foreground">{c.lastMessagePreview}</div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
