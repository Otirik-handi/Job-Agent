'use client';
import { useState } from 'react';
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
    <div className="border-t border-slate-200/60 bg-white/60 p-4">
      <Textarea
        value={text}
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        disabled={disabled}
        rows={3}
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
      <div className="mt-2 flex justify-end gap-2">
        {streaming ? (
          <Button size="sm" variant="outline" onClick={onStop}>停止</Button>
        ) : (
          <Button size="sm" disabled={disabled || !text.trim()} onClick={() => { onSend(text.trim()); setText(''); }}>
            发送
          </Button>
        )}
      </div>
    </div>
  );
}
