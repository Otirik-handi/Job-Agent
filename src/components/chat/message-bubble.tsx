'use client';
import type { UIMessage } from 'ai';
import { MarkdownText } from './markdown-text';
import { cn } from '@/src/lib/utils';

export function MessageBubble({ message }: { message: UIMessage }) {
  const textParts = message.parts.filter((p) => p.type === 'text');
  if (textParts.length === 0) return null;
  const isUser = message.role === 'user';
  return (
    <div className={cn('mb-3 flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3 py-2',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
        <MarkdownText text={textParts.map((p) => (p as { text: string }).text).join('\n')} />
      </div>
    </div>
  );
}
