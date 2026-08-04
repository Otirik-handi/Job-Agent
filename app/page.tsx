'use client';
import { useCallback, useState } from 'react';
import { ChatPanel } from '@/src/components/chat/chat-panel';
import { Sidebar } from '@/src/components/sidebar/sidebar';
import { useConversations } from '@/src/lib/use-conversations';
import { apiGet } from '@/src/lib/api';
import type { UIMessage } from 'ai';

export default function Home() {
  const { conversations, refresh } = useConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);

  const selectConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setInitialMessages(await apiGet<UIMessage[]>(`/api/conversations/${id}/messages`));
  }, []);

  const newConversation = useCallback(() => {
    setActiveId(null);
    setInitialMessages([]);
  }, []);

  return (
    <main className="flex h-screen">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeId}
        onSelectConversation={selectConversation}
        onNewConversation={newConversation}
        onOpenResume={() => {}}
      />
      <div className="flex-1">
        <ChatPanel
          key={activeId ?? 'new'}
          conversationId={activeId}
          initialMessages={initialMessages}
          onChatSettled={refresh}
        />
      </div>
    </main>
  );
}
