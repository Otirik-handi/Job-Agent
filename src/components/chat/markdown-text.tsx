'use client';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';

export function MarkdownText({ text }: { text: string }) {
  const safe = DOMPurify.sanitize(text);
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown>{safe}</ReactMarkdown>
    </div>
  );
}
