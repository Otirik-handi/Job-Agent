'use client';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { ConversationList } from './conversation-list';
import { ResourceTabs } from './resource-tabs';
import type { ConversationSummary } from '@/src/lib/use-conversations';

export function Sidebar({
  conversations, activeConversationId, onSelectConversation, onNewConversation,
  onRenameConversation, onDeleteConversation, onOpenResume, onOpenJob,
}: {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onRenameConversation: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenResume: (id: string) => void;
  onOpenJob: (id: string) => void;
}) {
  const [tab, setTab] = useState<'conversations' | 'resources'>('conversations');
  return (
    <aside className="flex w-[272px] shrink-0 flex-col border-r border-slate-200/60 bg-white shadow-card">
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
            onRename={onRenameConversation}
            onDelete={onDeleteConversation}
          />
        </TabsContent>
        <TabsContent value="resources" className="h-[calc(100%-3rem)]">
          <ResourceTabs onOpenResume={onOpenResume} onOpenJob={onOpenJob} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
