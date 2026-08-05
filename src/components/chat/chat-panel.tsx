'use client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRef, useState } from 'react';
import { MessageBubble } from './message-bubble';
import { ToolProgressCard } from './tool-progress-card';
import { ChatInput } from './chat-input';
import type { UIMessage } from 'ai';

export type ToolProgress = { toolName: string; status: 'running' | 'completed' | 'failed'; message: string };

export function ChatPanel({
  conversationId, initialMessages, title, onChatSettled,
}: {
  conversationId: string | null;
  initialMessages: UIMessage[];
  title: string;
  onChatSettled: () => void;
}) {
  const [progress, setProgress] = useState<ToolProgress | null>(null);
  const settledRef = useRef(false);

  const { messages, sendMessage, stop, status } = useChat({
    id: conversationId ?? undefined,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onData: (part) => {
      if (part.type === 'data-tool-progress') {
        const data = part.data as ToolProgress;
        setProgress(data);
        if (data.status === 'completed' || data.status === 'failed') settledRef.current = true;
      }
    },
    onFinish: () => {
      settledRef.current = true;
      onChatSettled();
      setProgress(null);
    },
  });

  return (
    <div className="flex h-full flex-col">
      {/* 会话标题栏 */}
      <div className="flex items-center gap-2 border-b border-slate-200/60 bg-white/60 px-6 py-3">
        <span className="h-2 w-2 rounded-full bg-indigo-500" />
        <h2 className="truncate text-sm font-semibold text-slate-700">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message, index) => (
          // key 兜底：存量历史消息可能无 id（服务端补 id 前的数据），用索引兜底避免 React key 冲突
          <MessageBubble key={message.id || `msg-${index}`} message={message} />
        ))}
        {progress && progress.status === 'running' && <ToolProgressCard progress={progress} />}
      </div>
      <ChatInput
        disabled={status === 'streaming' || status === 'submitted'}
        streaming={status === 'streaming' || status === 'submitted'}
        onSend={(text) => sendMessage({ text }, conversationId ? { body: { conversationId } } : undefined)}
        onStop={stop}
      />
    </div>
  );
}
