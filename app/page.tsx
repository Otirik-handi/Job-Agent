'use client';
import { useCallback, useState } from 'react';
import { ChatPanel } from '@/src/components/chat/chat-panel';
import { Sidebar } from '@/src/components/sidebar/sidebar';
import { ResumeDrawer } from '@/src/components/artifacts/resume-drawer';
import { JobDrawer } from '@/src/components/artifacts/job-drawer';
import { useConversations } from '@/src/lib/use-conversations';
import { apiGet, apiSend } from '@/src/lib/api';
import type { UIMessage } from 'ai';

export default function Home() {
  const { conversations, refresh, remove } = useConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [drawerResumeId, setDrawerResumeId] = useState<string | null>(null);
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);

  const selectConversation = useCallback(async (id: string) => {
    // 先加载消息再切换会话：保证 ChatPanel 重挂载时拿到正确的 initialMessages
    // （useChat 的 messages 参数只在挂载时生效，props 后更新会被忽略）
    const msgs = await apiGet<UIMessage[]>(`/api/conversations/${id}/messages`);
    setInitialMessages(msgs);
    setActiveId(id);
  }, []);

  const newConversation = useCallback(() => {
    setActiveId(null);
    setInitialMessages([]);
  }, []);

  const handleRenameConversation = useCallback(async (id: string, title: string) => {
    await apiSend(`/api/conversations/${id}`, 'PATCH', { title });
    await refresh();
  }, [refresh]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await remove(id);
    if (id === activeId) {
      const rest = conversations.filter((c) => c.id !== id);
      if (rest.length > 0) await selectConversation(rest[0].id);
      else newConversation();
    }
  }, [remove, activeId, conversations, selectConversation, newConversation]);

  // 当前会话标题（新会话显示"新对话"）
  const currentTitle = activeId
    ? (conversations.find((c) => c.id === activeId)?.title ?? '新对话')
    : '新对话';

  return (
    <main className="flex h-screen">
      {/* 装饰光斑：固定背景层，不挡交互 */}
      <div aria-hidden className="pointer-events-none fixed -bottom-24 -right-24 -z-10 size-96 rounded-full bg-indigo-500/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none fixed -left-24 -top-24 -z-10 size-80 rounded-full bg-pink-500/10 blur-3xl" />
      <Sidebar
        conversations={conversations}
        activeConversationId={activeId}
        onSelectConversation={selectConversation}
        onNewConversation={newConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onOpenResume={setDrawerResumeId}
        onOpenJob={setDrawerJobId}
        onDeletedResume={(id) => setDrawerResumeId((prev) => (prev === id ? null : prev))}
        onDeletedJob={(id) => setDrawerJobId((prev) => (prev === id ? null : prev))}
      />
      <div className="flex-1">
        <ChatPanel
          key={activeId ?? 'new'}
          conversationId={activeId}
          initialMessages={initialMessages}
          title={currentTitle}
          onChatSettled={refresh}
        />
      </div>
      <ResumeDrawer
        resumeId={drawerResumeId}
        open={drawerResumeId !== null}
        onOpenChange={(open) => { if (!open) setDrawerResumeId(null); }}
      />
      <JobDrawer
        jobId={drawerJobId}
        open={drawerJobId !== null}
        onOpenChange={(open) => { if (!open) setDrawerJobId(null); }}
      />
    </main>
  );
}
