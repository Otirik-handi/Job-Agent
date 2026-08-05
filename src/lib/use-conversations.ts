'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from './api';

export type ConversationSummary = {
  id: string; title: string; createdAt: string; updatedAt: string; lastMessagePreview: string;
};

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // 失败自动重试（最多 2 次）：覆盖 dev 模式首次路由按需编译导致的瞬时失败
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          setConversations(await apiGet<ConversationSummary[]>('/api/conversations'));
          return;
        } catch (err) {
          lastError = err;
          if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
        }
      }
      console.error('会话列表加载失败', lastError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await apiSend(`/api/conversations/${id}`, 'DELETE');
    await refresh();
  }, [refresh]);

  return { conversations, loading, refresh, remove };
}
