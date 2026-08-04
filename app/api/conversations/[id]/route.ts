import { z } from 'zod';
import { getConversation, renameConversation, deleteConversation } from '@/src/db/repositories/conversations';

const patchSchema = z.object({ title: z.string().min(1).max(50) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getConversation(id)) return Response.json({ code: 'CONVERSATION_NOT_FOUND', message: '会话不存在' }, { status: 404 });
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: 'INVALID_REQUEST', message: '请求格式无效' }, { status: 400 });
  renameConversation(id, parsed.data.title);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getConversation(id)) return Response.json({ code: 'CONVERSATION_NOT_FOUND', message: '会话不存在' }, { status: 404 });
  deleteConversation(id);
  return Response.json({ ok: true });
}
