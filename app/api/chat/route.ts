import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from 'ai';
import { z } from 'zod';
import { LlmConfigError } from '@/src/agent/model';
import { runAgentTurn } from '@/src/agent/run-agent';
import { createConversation, getConversation } from '@/src/db/repositories/conversations';

const requestSchema = z.object({
  conversationId: z.string().min(1).nullable().optional(),
  messages: z.array(z.object({ id: z.string(), role: z.enum(['user', 'assistant']), parts: z.array(z.unknown()) })).min(1),
});

function titleFromFirstMessage(messages: UIMessage[]): string {
  const first = messages[0];
  const text = first.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 20) || '新对话';
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ code: 'INVALID_REQUEST', message: '请求格式无效' }, { status: 400 });
  }
  const { conversationId, messages } = parsed.data;
  const incoming = messages as UIMessage[];

  let convId: string;
  if (!conversationId) {
    convId = createConversation(titleFromFirstMessage(incoming)).id;
  } else {
    const existing = getConversation(conversationId);
    if (!existing) {
      return Response.json({ code: 'CONVERSATION_NOT_FOUND', message: '会话不存在' }, { status: 404 });
    }
    convId = conversationId;
  }

  const stream = createUIMessageStream({
    onError: (error) => {
      if (error instanceof LlmConfigError) return error.message;
      return '处理请求时发生错误，请稍后重试';
    },
    execute: async ({ writer }) => {
      // 推送会话 id：新会话首条消息由服务端创建，前端需获知 id 以便后续消息复用同一会话
      writer.write({
        type: 'data-conversation-id',
        data: { conversationId: convId },
        transient: true,
      });
      // Agent 循环、消息持久化与会话状态回写全部收敛在 runAgentTurn 内；
      // 路由层只负责 UI 侧职责：进度事件转 data-tool-progress 推流
      const result = await runAgentTurn({
        conversationId: convId,
        messages: incoming,
        onToolProgress: (event) => {
          writer.write({
            type: 'data-tool-progress',
            data: { toolName: event.toolName, status: event.status, message: event.message },
            transient: true,
          });
        },
      });
      // 助手回复 chunk 流回客户端（原 writer.merge(clientSide) 语义）；
      // runAgentTurn 返回时流已完整产出，此处为整批 merge，非边生成边推
      writer.merge(result.stream);
    },
  });

  return createUIMessageStreamResponse({ stream });
}
