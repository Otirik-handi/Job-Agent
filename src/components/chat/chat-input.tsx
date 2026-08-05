'use client';
import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';

export function ChatInput({
  disabled, streaming, onSend, onStop,
}: {
  disabled: boolean; streaming: boolean;
  onSend: (text: string) => void; onStop: () => void;
}) {
  const [text, setText] = useState('');
  return (
    <div className="border-t border-slate-200 bg-white p-4">
      <div className="mx-auto w-full max-w-2xl">
        <div className="relative">
          {/* 装饰图标：浅底回形针，纯装饰（未来可接入上传入口） */}
          <span aria-hidden className="pointer-events-none absolute left-3 top-3.5 flex size-6 items-center justify-center rounded-full bg-indigo-500/10">
            <Paperclip className="size-3.5 text-indigo-500" />
          </span>
          <Textarea
            value={text}
            placeholder="💡 试着告诉我：帮我分析简历 / 匹配这个岗位"
            disabled={disabled}
            rows={3}
            className="min-h-30 pl-10"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (text.trim() && !disabled) {
                  onSend(text.trim());
                  setText('');
                }
              }
            }}
          />
        </div>
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">Shift+Enter 换行</span>
          {streaming ? (
            <Button size="sm" variant="outline" onClick={onStop}>停止</Button>
          ) : (
            <Button size="sm" disabled={disabled || !text.trim()} onClick={() => { onSend(text.trim()); setText(''); }}>
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
