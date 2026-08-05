'use client';
import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { ConfirmDialog } from '@/src/components/ui/confirm-dialog';
import { cn } from '@/src/lib/utils';
import { formatRelativeTime } from '@/src/lib/format-time';
import type { ConversationSummary } from '@/src/lib/use-conversations';

export function ConversationList({
  conversations, activeId, onSelect, onNew, onRename, onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  const commitRename = () => {
    if (editingId) {
      const title = draft.trim();
      const original = conversations.find((c) => c.id === editingId)?.title;
      if (title && title !== original) onRename(editingId, title);
    }
    setEditingId(null);
  };

  return (
    <div className="flex h-full flex-col gap-1.5 p-3">
      <Button size="sm" variant="outline" className="mb-1" onClick={onNew}>＋ 新对话</Button>
      {conversations.length === 0 && (
        <div className="rounded-2xl bg-slate-100/60 px-3 py-6 text-center text-xs text-muted-foreground">暂无会话</div>
      )}
      {conversations.map((c) => (
        <div
          key={c.id}
          className={cn(
            'group relative rounded-xl transition-all hover:bg-slate-100',
            c.id === activeId && 'bg-slate-100 font-medium shadow-soft',
          )}
        >
          {editingId === c.id ? (
            <input
              ref={inputRef}
              maxLength={50}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') setEditingId(null);
              }}
              onBlur={commitRename}
              className="w-full rounded-xl border border-indigo-300 bg-white px-3 py-2 text-sm outline-none"
            />
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.id); }
              }}
              className="cursor-pointer px-3 py-2 text-left text-sm"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate">{c.title}</span>
                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setDraft(c.title); }}
                    className="rounded-md p-1 text-muted-foreground hover:bg-slate-200/70 hover:text-foreground"
                    aria-label={`重命名会话 ${c.title}`}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                    className="rounded-md p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600"
                    aria-label={`删除会话 ${c.title}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                {c.lastMessagePreview && (
                  <span className="truncate text-xs text-muted-foreground">{c.lastMessagePreview}</span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(c.updatedAt)}</span>
              </div>
            </div>
          )}
        </div>
      ))}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除会话"
        description={deleteTarget ? `确定要删除「${deleteTarget.title}」吗？会话中的全部消息将一并删除，此操作不可恢复。` : ''}
        confirmText="删除"
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => { if (deleteTarget) onDelete(deleteTarget.id); setDeleteTarget(null); }}
      />
    </div>
  );
}
