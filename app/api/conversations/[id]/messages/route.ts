import { getConversation } from '@/src/db/repositories/conversations';
import { listMessages } from '@/src/db/repositories/messages';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getConversation(id)) return Response.json({ code: 'CONVERSATION_NOT_FOUND', message: '会话不存在' }, { status: 404 });
  const records = listMessages(id);
  const messages = records
    .map((r) => {
      try { return JSON.parse(r.messageJson); } catch { return null; }
    })
    .filter((m) => m !== null);
  return Response.json(messages);
}
