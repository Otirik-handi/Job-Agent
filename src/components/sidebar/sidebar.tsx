'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { ConversationList } from './conversation-list';
import { ResourceTabs } from './resource-tabs';
import type { ConversationSummary } from '@/src/lib/use-conversations';

export function Sidebar({
  conversations, activeConversationId, onSelectConversation, onNewConversation,
  onRenameConversation, onDeleteConversation, onOpenResume, onOpenJob,
  onDeletedResume, onDeletedJob,
}: {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onRenameConversation: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenResume: (id: string) => void;
  onOpenJob: (id: string) => void;
  onDeletedResume: (id: string) => void;
  onDeletedJob: (id: string) => void;
}) {
  const [tab, setTab] = useState<'conversations' | 'resources'>('conversations');
  return (
    <aside className="flex w-[272px] shrink-0 flex-col border-r border-slate-200/60 bg-gradient-to-b from-indigo-50/70 via-white to-white shadow-card">
      {/* 品牌 Logo 区 */}
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-soft">
          <Sparkles className="size-4 text-white" />
        </div>
        <span className="truncate text-sm font-semibold text-slate-700">Job Helper</span>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'conversations' | 'resources')} className="flex-1 min-h-0">
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
          <ResourceTabs
            onOpenResume={onOpenResume}
            onOpenJob={onOpenJob}
            onDeletedResume={onDeletedResume}
            onDeletedJob={onDeletedJob}
          />
        </TabsContent>
      </Tabs>
      {/* 底部分色圆点装饰 */}
      <div aria-hidden className="flex shrink-0 items-center justify-center gap-1.5 border-t border-slate-200/60 px-4 py-3 opacity-60">
        <span className="size-1.5 rounded-full bg-indigo-500" />
        <span className="size-1.5 rounded-full bg-pink-500" />
        <span className="size-1.5 rounded-full bg-emerald-500" />
        <span className="size-1.5 rounded-full bg-amber-500" />
      </div>
    </aside>
  );
}
