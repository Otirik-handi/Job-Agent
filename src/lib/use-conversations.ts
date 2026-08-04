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
      setConversations(await apiGet<ConversationSummary[]>('/api/conversations'));
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
