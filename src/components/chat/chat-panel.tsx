'use client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRef, useState } from 'react';
import { MessageBubble } from './message-bubble';
import { ToolProgressCard } from './tool-progress-card';
import { ChatInput } from './chat-input';

export type ToolProgress = { toolName: string; status: 'running' | 'completed' | 'failed'; message: string };

export function ChatPanel({ onChatSettled }: { onChatSettled: () => void }) {
  const [progress, setProgress] = useState<ToolProgress | null>(null);
  const settledRef = useRef(false);

  const { messages, sendMessage, stop, status } = useChat({
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
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {progress && progress.status === 'running' && <ToolProgressCard progress={progress} />}
      </div>
      <ChatInput
        disabled={status === 'streaming' || status === 'submitted'}
        streaming={status === 'streaming' || status === 'submitted'}
        onSend={(text) => sendMessage({ text })}
        onStop={stop}
      />
    </div>
  );
}
