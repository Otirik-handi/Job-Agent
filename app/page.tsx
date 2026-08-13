'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatPanel } from '@/src/components/chat/chat-panel';
import { Sidebar } from '@/src/components/sidebar/sidebar';
import { ResumeDrawer } from '@/src/components/artifacts/resume-drawer';
import { JobDrawer } from '@/src/components/artifacts/job-drawer';
import { TailoredResumeDrawer } from '@/src/components/artifacts/tailored-resume-drawer';
import { SkillDrawer } from '@/src/components/artifacts/skill-drawer';
import { useConversations } from '@/src/lib/use-conversations';
import { apiGet, apiSend } from '@/src/lib/api';
import type { UIMessage } from 'ai';

/** 最近会话持久化 key：刷新后恢复上次会话视图（仅客户端，挂载后读写） */
const LAST_CONVERSATION_KEY = 'job-helper.last-conversation-id';

export default function Home() {
  const { conversations, refresh, remove } = useConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  // ChatPanel 重挂载键：仅"切换/新建会话"时递增；
  // 首次创建会话（activeId null → id）不递增，避免流式回复中途重挂载丢失消息
  const [chatKey, setChatKey] = useState(0);
  // 资源刷新信号：每轮对话结束递增，驱动侧栏资源列表与已打开抽屉重新拉取（对话落库 → UI 自动同步）
  const [resourceSignal, setResourceSignal] = useState(0);
  const [drawerResumeId, setDrawerResumeId] = useState<string | null>(null);
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);
  const [drawerTailoredId, setDrawerTailoredId] = useState<string | null>(null);
  const [drawerSkillName, setDrawerSkillName] = useState<string | null>(null);

  const handleChatSettled = useCallback(() => {
    void refresh(); // 会话列表（标题/顺序）
    setResourceSignal((s) => s + 1); // 资源列表与抽屉详情
  }, [refresh]);

  const selectConversation = useCallback(async (id: string) => {
    // 先加载消息再切换会话：保证 ChatPanel 重挂载时拿到正确的 initialMessages
    // （useChat 的 messages 参数只在挂载时生效，props 后更新会被忽略）
    const msgs = await apiGet<UIMessage[]>(`/api/conversations/${id}/messages`);
    setInitialMessages(msgs);
    setActiveId(id);
    setChatKey((k) => k + 1);
    window.localStorage.setItem(LAST_CONVERSATION_KEY, id);
  }, []);

  const newConversation = useCallback(() => {
    setActiveId(null);
    setInitialMessages([]);
    setChatKey((k) => k + 1);
    window.localStorage.removeItem(LAST_CONVERSATION_KEY);
  }, []);

  const handleConversationCreated = useCallback((id: string) => {
    setActiveId(id);
    window.localStorage.setItem(LAST_CONVERSATION_KEY, id);
  }, []);

  // 刷新后恢复最近会话：等会话列表加载完成（首轮渲染可能为空）后，若存在则自动打开
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || conversations.length === 0) return;
    restoredRef.current = true;
    const saved = window.localStorage.getItem(LAST_CONVERSATION_KEY);
    if (saved && conversations.some((c) => c.id === saved)) {
      void selectConversation(saved);
    } else {
      window.localStorage.removeItem(LAST_CONVERSATION_KEY);
    }
  }, [conversations, selectConversation]);

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
      <div aria-hidden className="pointer-events-none fixed -right-24 -top-24 -z-10 size-80 rounded-full bg-pink-500/10 blur-3xl" />
      <Sidebar
        conversations={conversations}
        activeConversationId={activeId}
        refreshSignal={resourceSignal}
        onSelectConversation={selectConversation}
        onNewConversation={newConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onOpenResume={setDrawerResumeId}
        onOpenJob={setDrawerJobId}
        onOpenTailored={setDrawerTailoredId}
        onOpenSkill={setDrawerSkillName}
        onDeletedResume={(id) => setDrawerResumeId((prev) => (prev === id ? null : prev))}
        onDeletedJob={(id) => setDrawerJobId((prev) => (prev === id ? null : prev))}
        onDeletedTailored={(id) => setDrawerTailoredId((prev) => (prev === id ? null : prev))}
      />
      <div className="flex-1">
        <ChatPanel
          key={chatKey}
          conversationId={activeId}
          initialMessages={initialMessages}
          title={currentTitle}
          onChatSettled={handleChatSettled}
          onConversationCreated={handleConversationCreated}
        />
      </div>
      <ResumeDrawer
        resumeId={drawerResumeId}
        open={drawerResumeId !== null}
        refreshSignal={resourceSignal}
        onOpenChange={(open) => { if (!open) setDrawerResumeId(null); }}
      />
      <JobDrawer
        jobId={drawerJobId}
        open={drawerJobId !== null}
        refreshSignal={resourceSignal}
        onOpenChange={(open) => { if (!open) setDrawerJobId(null); }}
        onOpenTailored={setDrawerTailoredId}
      />
      <TailoredResumeDrawer
        tailoredResumeId={drawerTailoredId}
        open={drawerTailoredId !== null}
        refreshSignal={resourceSignal}
        onOpenChange={(open) => { if (!open) setDrawerTailoredId(null); }}
        onDeleted={(id) => setDrawerTailoredId((prev) => (prev === id ? null : prev))}
      />
      <SkillDrawer
        skillName={drawerSkillName}
        open={drawerSkillName !== null}
        onOpenChange={(open) => { if (!open) setDrawerSkillName(null); }}
      />
    </main>
  );
}
