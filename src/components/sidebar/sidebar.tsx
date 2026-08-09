'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { ConversationList } from './conversation-list';
import { ResourceTabs } from './resource-tabs';
import type { ConversationSummary } from '@/src/lib/use-conversations';

export function Sidebar({
  conversations, activeConversationId, refreshSignal, onSelectConversation, onNewConversation,
  onRenameConversation, onDeleteConversation, onOpenResume, onOpenJob, onOpenTailored,
  onDeletedResume, onDeletedJob, onDeletedTailored,
}: {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  refreshSignal?: number;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onRenameConversation: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenResume: (id: string) => void;
  onOpenJob: (id: string) => void;
  onOpenTailored: (id: string) => void;
  onDeletedResume: (id: string) => void;
  onDeletedJob: (id: string) => void;
  onDeletedTailored: (id: string) => void;
}) {
  const [tab, setTab] = useState<'conversations' | 'resources'>('conversations');
  // 滑动指示器：跟随选中 Tab（白色胶囊，选中色保持原样）
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const bar = tabBarRef.current;
    const el = bar?.querySelector<HTMLElement>(`[data-sidebar-tab="${tab}"]`);
    if (bar && el) setIndicator({ x: el.offsetLeft, w: el.offsetWidth });
  }, [tab]);
  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-slate-200/60 bg-gradient-to-b from-indigo-50/70 via-white to-white shadow-card">
      {/* 品牌 Logo 区 */}
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-soft">
          <Sparkles className="size-4 text-white" />
        </div>
        <span className="truncate text-sm font-semibold text-slate-700">Job Helper</span>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'conversations' | 'resources')} className="flex-1 min-h-0">
        <div ref={tabBarRef} className="relative m-2">
          {/* 滑动指示器：与选中块原样式完全同形（白底 rounded-md 同高 shadow-soft），z-10 保证阴影不被 TabsList 背景遮挡 */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-1 left-0 z-10 rounded-md bg-white shadow-soft transition-all duration-300 ease-out"
            style={{ width: indicator.w || undefined, transform: `translateX(${indicator.x}px)` }}
          />
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="conversations" data-sidebar-tab="conversations" className="z-20 data-active:bg-transparent data-active:shadow-none">
              会话
            </TabsTrigger>
            <TabsTrigger value="resources" data-sidebar-tab="resources" className="z-20 data-active:bg-transparent data-active:shadow-none">
              资源
            </TabsTrigger>
          </TabsList>
        </div>
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
            refreshSignal={refreshSignal}
            onOpenResume={onOpenResume}
            onOpenJob={onOpenJob}
            onOpenTailored={onOpenTailored}
            onDeletedResume={onDeletedResume}
            onDeletedJob={onDeletedJob}
            onDeletedTailored={onDeletedTailored}
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
