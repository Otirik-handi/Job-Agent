'use client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { EmptyState } from '@/src/components/ui/empty-state';
import { MessageBubble } from './message-bubble';
import { ToolProgressCard } from './tool-progress-card';
import { ChatInput } from './chat-input';
import type { UIMessage } from 'ai';

export type ToolProgress = { toolName: string; status: 'running' | 'completed' | 'failed'; message: string };

/** 距底部多少像素内视为"跟随底部"（避免用户上滑查看历史时被强制拉回） */
const STICK_THRESHOLD = 80;

export function ChatPanel({
  conversationId, initialMessages, title, onChatSettled, onConversationCreated,
}: {
  conversationId: string | null;
  initialMessages: UIMessage[];
  title: string;
  onChatSettled: () => void;
  onConversationCreated: (id: string) => void;
}) {
  const [progress, setProgress] = useState<ToolProgress | null>(null);
  const settledRef = useRef(false);
  // 服务端创建新会话后通过 conversation-id 事件回传真实 id，后续消息复用它
  const [internalConvId, setInternalConvId] = useState<string | null>(conversationId);
  useEffect(() => { setInternalConvId(conversationId); }, [conversationId]);

  const { messages, sendMessage, stop, status } = useChat({
    id: internalConvId ?? undefined,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onData: (part) => {
      if (part.type === 'data-tool-progress') {
        const data = part.data as ToolProgress;
        setProgress(data);
        if (data.status === 'completed' || data.status === 'failed') settledRef.current = true;
      } else if (part.type === 'data-conversation-id') {
        const id = (part.data as { conversationId: string }).conversationId;
        if (id) {
          setInternalConvId(id);
          onConversationCreated(id);
        }
      }
    },
    onFinish: () => {
      settledRef.current = true;
      onChatSettled();
      setProgress(null);
    },
  });

  // —— 滚动跟随底部：新消息/流式输出时若用户处于底部附近则自动滚到最下方 ——
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setStickToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD);
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom) el.scrollTop = el.scrollHeight;
  }, [messages, stickToBottom]);

  return (
    <div className="flex h-full flex-col">
      {/* 会话标题栏 */}
      <div className="flex items-center gap-2 border-b border-slate-200/60 bg-white/60 px-6 py-3">
        <span className="h-2 w-2 rounded-full bg-indigo-500" />
        <h2 className="truncate text-sm font-semibold text-slate-700">{title}</h2>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4"
        style={{
          backgroundImage:
            'linear-gradient(rgba(100,116,139,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.05) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {messages.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="你好，我是你的求职助手"
            description="让我帮你分析简历、匹配岗位、发现机会——直接告诉我你的需求吧"
            className="h-full"
          />
        ) : (
          messages.map((message, index) => (
            // key 兜底：存量历史消息可能无 id（服务端补 id 前的数据），用索引兜底避免 React key 冲突
            <MessageBubble key={message.id || `msg-${index}`} message={message} />
          ))
        )}
        {progress && progress.status === 'running' && <ToolProgressCard progress={progress} />}
      </div>
      <ChatInput
        disabled={status === 'streaming' || status === 'submitted'}
        streaming={status === 'streaming' || status === 'submitted'}
        onSend={(text) => sendMessage({ text }, internalConvId ? { body: { conversationId: internalConvId } } : undefined)}
        onStop={stop}
      />
    </div>
  );
}
