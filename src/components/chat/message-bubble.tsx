'use client';
import type { UIMessage } from 'ai';
import { Bot, User } from 'lucide-react';
import { MarkdownText } from './markdown-text';
import { cn } from '@/src/lib/utils';

/** 消息气泡：带角色头像指示器（user 右侧 / assistant 左侧） */
export function MessageBubble({ message }: { message: UIMessage }) {
  const textParts = message.parts.filter((p) => p.type === 'text');
  if (textParts.length === 0) return null;
  const isUser = message.role === 'user';
  const text = textParts.map((p) => (p as { text: string }).text).join('\n');

  return (
    <div className={cn('mb-4 flex items-start gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* 头像指示器 */}
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary/10 text-primary' : 'bg-slate-200/70 text-slate-600',
        )}
        aria-label={isUser ? '用户' : '助手'}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      {/* 气泡 */}
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-3 shadow-soft',
          isUser
            ? 'rounded-tr-md bg-primary/10 text-slate-800'
            : 'rounded-tl-md bg-white text-slate-800',
        )}
      >
        <MarkdownText text={text} />
      </div>
    </div>
  );
}
