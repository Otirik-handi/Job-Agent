import { z } from 'zod';
import { createConversation, listConversations } from '@/src/db/repositories/conversations';
import { listMessages } from '@/src/db/repositories/messages';

export async function GET() {
  const convs = listConversations();
  const withPreview = convs.map((c) => {
    const msgs = listMessages(c.id);
    const last = msgs[msgs.length - 1];
    let preview = '';
    if (last) {
      try {
        const parsed = JSON.parse(last.messageJson) as { parts?: Array<{ type?: string; text?: string }> };
        preview = parsed.parts?.filter((p) => p.type === 'text').map((p) => p.text ?? '').join(' ').slice(0, 60) ?? '';
      } catch { preview = ''; }
    }
    return { id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, lastMessagePreview: preview };
  });
  return Response.json(withPreview);
}

const createSchema = z.object({ title: z.string().max(50).optional() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: 'INVALID_REQUEST', message: '请求格式无效' }, { status: 400 });
  const conv = createConversation(parsed.data.title ?? '新对话');
  return Response.json(conv, { status: 201 });
}
