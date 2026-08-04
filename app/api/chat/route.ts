import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  readUIMessageStream,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { getModel, LlmConfigError } from '@/src/agent/model';
import { getTools, SYSTEM_PROMPT } from '@/src/agent/agent';
import { createConversation, getConversation, touchConversation } from '@/src/db/repositories/conversations';
import { insertMessage, listMessages } from '@/src/db/repositories/messages';

const MAX_HISTORY_ROUNDS = 20;

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

  const historyRecords = listMessages(convId);
  const history: UIMessage[] = historyRecords
    .map((r) => {
      try { return JSON.parse(r.messageJson) as UIMessage; } catch { return null; }
    })
    .filter((m): m is UIMessage => m !== null);
  const merged = [...history, ...incoming];
  const trimmed = merged.slice(-MAX_HISTORY_ROUNDS * 2);

  for (const msg of incoming) {
    insertMessage(convId, msg.role, JSON.stringify(msg));
  }

  const stream = createUIMessageStream({
    onError: (error) => {
      if (error instanceof LlmConfigError) return error.message;
      return '处理请求时发生错误，请稍后重试';
    },
    execute: async ({ writer }) => {
      const model = getModel();
      const result = streamText({
        model,
        system: SYSTEM_PROMPT,
        messages: await convertToModelMessages(trimmed),
        tools: getTools(),
        onToolExecutionStart: (event) => {
          const toolName = event.toolCall.toolName;
          const progressText = toolName === 'importResume' ? '正在读取简历…'
            : toolName === 'analyzeResume' ? '正在分析简历…' : '正在处理…';
          writer.write({
            type: 'data-tool-progress',
            data: { toolName, status: 'running', message: progressText },
            transient: true,
          });
        },
        onToolExecutionEnd: (event) => {
          const { toolName } = event.toolCall;
          const success = event.toolOutput.type === 'tool-result';
          writer.write({
            type: 'data-tool-progress',
            data: {
              toolName,
              status: success ? 'completed' : 'failed',
              message: success ? '完成' : '失败',
            },
            transient: true,
          });
        },
      });

      const uiStream = toUIMessageStream({ stream: result.stream });
      const [clientSide, collectSide] = uiStream.tee();
      const collected: UIMessage[] = [];
      const collector = (async () => {
        for await (const msg of readUIMessageStream({ stream: collectSide })) {
          collected.push(msg);
        }
        const byId = new Map<string, UIMessage>();
        for (const m of collected) byId.set(m.id, m);
        for (const m of byId.values()) {
          if (m.role === 'assistant') insertMessage(convId, 'assistant', JSON.stringify(m));
        }
        touchConversation(convId);
      })();
      writer.merge(clientSide);
      await collector;
    },
  });

  return createUIMessageStreamResponse({ stream });
}
