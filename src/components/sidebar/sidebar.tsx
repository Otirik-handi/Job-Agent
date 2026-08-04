'use client';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { ConversationList } from './conversation-list';
import { ResourceTabs } from './resource-tabs';
import type { ConversationSummary } from '@/src/lib/use-conversations';

export function Sidebar({
  conversations, activeConversationId, onSelectConversation, onNewConversation, onOpenResume,
}: {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onOpenResume: (id: string) => void;
}) {
  const [tab, setTab] = useState<'conversations' | 'resources'>('conversations');
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'conversations' | 'resources')}>
        <TabsList className="m-2 grid w-[calc(100%-1rem)] grid-cols-2">
          <TabsTrigger value="conversations">会话</TabsTrigger>
          <TabsTrigger value="resources">资源</TabsTrigger>
        </TabsList>
        <TabsContent value="conversations" className="h-[calc(100%-3rem)]">
          <ConversationList
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={onSelectConversation}
            onNew={onNewConversation}
          />
        </TabsContent>
        <TabsContent value="resources" className="h-[calc(100%-3rem)]">
          <ResourceTabs onOpenResume={onOpenResume} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
