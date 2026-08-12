'use client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { ListChecks, Sparkles } from 'lucide-react';
import { EmptyState } from '@/src/components/ui/empty-state';
import { useActivePlans, type ActivePlanProgress } from '@/src/lib/use-active-plans';
import { MessageBubble } from './message-bubble';
import { ToolProgressCard } from './tool-progress-card';
import { ChatInput } from './chat-input';
import type { UIMessage } from 'ai';

export type ToolProgress = { toolName: string; status: 'running' | 'completed' | 'failed'; message: string };

/** 距底部多少像素内视为"跟随底部"（避免用户上滑查看历史时被强制拉回） */
const STICK_THRESHOLD = 80;

/** 有当前进行中步骤（currentStepIndex 非空）的活跃计划，用于进度横幅渲染 */
type PlanProgressWithStep = ActivePlanProgress & { currentStepIndex: number; currentStepTitle: string };

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
  // useChat 的 id 只在首次渲染时确定（新会话为 undefined、既有会话为传入 id）：
  // AI SDK 检测到 id 变化会重建 Chat 对象并清空 messages（见 useChat 内 shouldRecreateChat），
  // 因此服务端回传真实 conversationId 后只写入 ref 供请求 body 复用，不再回写 useChat id。
  const [chatId] = useState(conversationId);
  const convIdRef = useRef<string | null>(conversationId);
  useEffect(() => { convIdRef.current = conversationId; }, [conversationId]);
  // 消息流结束计数：每次对话流结束 +1，驱动活跃计划进度刷新（挂载时也会拉一次）
  const [settleCount, setSettleCount] = useState(0);
  const { plans } = useActivePlans(settleCount);
  const activeProgress = plans.filter(
    (p): p is PlanProgressWithStep => p.currentStepIndex !== null && p.currentStepTitle !== null,
  );

  const { messages, sendMessage, stop, status } = useChat({
    id: chatId ?? undefined,
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
          convIdRef.current = id;
          onConversationCreated(id);
        }
      }
    },
    onFinish: () => {
      settledRef.current = true;
      onChatSettled();
      setProgress(null);
      // 计划进度单一事实来源为计划文件，消息流结束后重新拉取对齐（含计划推进/完成）
      setSettleCount((c) => c + 1);
    },
  });

  const busy = status === 'streaming' || status === 'submitted';
  /** 发送用户消息（复用会话 id）；recordApplicationStatus 确认按钮亦经此发送确认消息 */
  const sendText = (text: string) =>
    sendMessage({ text }, convIdRef.current ? { body: { conversationId: convIdRef.current } } : undefined);

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
      {/* 规划进度联动：有进行中步骤的活跃计划时显示「第 N 步（共 M 步）+ 当前步骤名」；
          计划全部完成或无活跃计划时不渲染（数据源：data/plans 计划文件，经 /api/plans/active） */}
      {activeProgress.length > 0 && (
        <div
          role="status"
          className="flex items-center gap-2.5 border-b border-indigo-100 bg-indigo-50/70 px-6 py-2"
        >
          <ListChecks className="size-4 shrink-0 text-indigo-600" aria-hidden />
          <div className="flex min-w-0 flex-col gap-0.5">
            {activeProgress.map((p) => (
              <span key={p.taskId} className="truncate text-sm text-indigo-700">
                计划「{p.title}」第 {p.currentStepIndex + 1} 步（共 {p.totalSteps} 步）：{p.currentStepTitle}
              </span>
            ))}
          </div>
        </div>
      )}
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
            <MessageBubble
              key={message.id || `msg-${index}`}
              message={message}
              onConfirmRecordStatus={sendText}
              onRetryTool={sendText}
              busy={busy}
            />
          ))
        )}
        {/* 运行中/失败状态展示进度卡片（完成态由 onFinish 清空，不展示） */}
        {progress && progress.status !== 'completed' && <ToolProgressCard progress={progress} />}
      </div>
      <ChatInput
        disabled={busy}
        streaming={busy}
        onSend={sendText}
        onStop={stop}
      />
    </div>
  );
}
