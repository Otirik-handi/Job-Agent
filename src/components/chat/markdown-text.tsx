'use client';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';
import { cn } from '@/src/lib/utils';

/** Markdown 渲染：react-markdown + DOMPurify 净化 + typography prose 排版（成熟方案） */
export function MarkdownText({ text, className }: { text: string; className?: string }) {
  const safe = DOMPurify.sanitize(text);
  return (
    <div className={cn(
      'prose prose-sm prose-slate max-w-none',
      '[&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul:first-child]:mt-0 [&_ul:last-child]:mb-0 [&_ol:first-child]:mt-0 [&_ol:last-child]:mb-0 [&_pre:first-child]:mt-0 [&_pre:last-child]:mb-0 [&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0 [&_h4:first-child]:mt-0',
      className,
    )}>
      <ReactMarkdown>{safe}</ReactMarkdown>
    </div>
  );
}
