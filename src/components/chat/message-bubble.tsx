'use client';
import type { UIMessage } from 'ai';
import { MarkdownText } from './markdown-text';
import { cn } from '@/src/lib/utils';

export function MessageBubble({ message }: { message: UIMessage }) {
  const textParts = message.parts.filter((p) => p.type === 'text');
  if (textParts.length === 0) return null;
  const isUser = message.role === 'user';
  return (
    <div className={cn('mb-4 flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3 shadow-soft',
          isUser ? 'bg-primary/10 text-slate-800' : 'bg-white text-slate-800',
        )}
      >
        <MarkdownText text={textParts.map((p) => (p as { text: string }).text).join('\n')} />
      </div>
    </div>
  );
}
