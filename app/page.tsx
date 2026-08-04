'use client';
import { ChatPanel } from '@/src/components/chat/chat-panel';

export default function Home() {
  return (
    <main className="flex h-screen flex-col">
      <ChatPanel onChatSettled={() => {}} />
    </main>
  );
}
