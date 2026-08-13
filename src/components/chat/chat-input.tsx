'use client';
import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { useLlmConfig } from '@/src/lib/use-llm-config';

export function ChatInput({
  disabled, streaming, onSend, onStop,
}: {
  disabled: boolean; streaming: boolean;
  onSend: (text: string) => void; onStop: () => void;
}) {
  const [text, setText] = useState('');
  // 模型指示灯：灰=加载中/失败，红=未配置，黄=生成中，绿=空闲（数据源 GET /api/config/llm）
  const { info } = useLlmConfig();
  const lightClass = !info
    ? 'bg-slate-300'
    : !info.configured
      ? 'bg-red-500'
      : streaming
        ? 'bg-amber-400'
        : 'bg-emerald-500';
  const modelLabel = !info ? '' : info.configured ? `${info.provider}/${info.model}` : '模型未配置';
  return (
    <div className="border-t border-slate-200 bg-white p-4">
      <div className="mx-auto w-full max-w-[52.5rem]">
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
        <div className="mt-2 flex items-center justify-between gap-2">
          <span role="status" className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${lightClass}`} />
            <span className="truncate">{modelLabel}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">Shift+Enter 换行</span>
            {streaming ? (
              <Button size="sm" variant="outline" onClick={onStop}>停止</Button>
            ) : (
              <Button size="sm" disabled={disabled || !text.trim()} onClick={() => { onSend(text.trim()); setText(''); }}>
                发送
              </Button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
