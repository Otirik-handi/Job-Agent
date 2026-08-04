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
    <div className="flex h-full flex-col gap-1 p-2">
      <Button size="sm" variant="outline" className="mb-1" onClick={onNew}>＋ 新对话</Button>
      {conversations.length === 0 && (
        <p className="px-2 py-4 text-center text-xs text-muted-foreground">暂无会话</p>
      )}
      {conversations.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={cn(
            'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
            c.id === activeId && 'bg-muted font-medium',
          )}
        >
          <div className="truncate">{c.title}</div>
          {c.lastMessagePreview && (
            <div className="truncate text-xs text-muted-foreground">{c.lastMessagePreview}</div>
          )}
        </button>
      ))}
    </div>
  );
}
