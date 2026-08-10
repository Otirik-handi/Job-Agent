import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  readUIMessageStream,
  ToolLoopAgent,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getModel, LlmConfigError } from '@/src/agent/model';
import { getTools } from '@/src/agent/agent';
import { buildSystemPrompt } from '@/src/agent/context';
import { createConversation, getConversation, touchConversation } from '@/src/db/repositories/conversations';
import { insertMessage, listMessages } from '@/src/db/repositories/messages';
import { listMemoryBlocks } from '@/src/db/repositories/memory-blocks';
import { getSessionState, setSessionState } from '@/src/db/repositories/session-state';

const MAX_HISTORY_ROUNDS = 12;

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

type SessionStatePatch = { currentResumeId?: string; currentJobId?: string };

/** 从工具成功结果中提取会话状态补丁；无法提取时返回 null（其他工具成功不更新状态） */
function sessionStatePatchFromTool(toolName: string, output: unknown): SessionStatePatch | null {
  if (typeof output !== 'object' || output === null) return null;
  const o = output as Record<string, unknown>;
  switch (toolName) {
    case 'importJobOpportunity': {
      const id = o.jobOpportunityId;
      return typeof id === 'string' && id ? { currentJobId: id } : null;
    }
    case 'importResume': {
      const id = o.resumeId;
      return typeof id === 'string' && id ? { currentResumeId: id } : null;
    }
    case 'analyzeResume': {
      const id = o.resumeId;
      return o.ok === true && typeof id === 'string' && id ? { currentResumeId: id } : null;
    }
    case 'matchJob': {
      const id = o.jobOpportunityId;
      return o.ok === true && typeof id === 'string' && id ? { currentJobId: id } : null;
    }
    default:
      return null;
  }
}

/** 先读旧会话状态再合并补丁回写（避免覆盖）；异常仅记录日志，不阻断主流程 */
function persistSessionState(conversationId: string, patch: SessionStatePatch): void {
  try {
    const prev = getSessionState(conversationId);
    let prevState: Record<string, unknown> = {};
    if (prev) {
      try {
        const parsed = JSON.parse(prev.stateJson) as unknown;
        if (typeof parsed === 'object' && parsed !== null) {
          prevState = parsed as Record<string, unknown>;
        }
      } catch {
        // 旧状态 JSON 损坏则忽略，从空状态开始合并
      }
    }
    setSessionState(conversationId, JSON.stringify({ ...prevState, ...patch }));
  } catch (err) {
    console.error(`[session-state] 回写失败 conversationId=${conversationId}:`, err);
  }
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

  // 入站消息按 id 去重：AI SDK useChat 在多步 Agent 循环中会自动重发消息历史，
  // 直接插入会产生同 id 重复记录，导致前端 React key 冲突
  const existingIds = new Set<string>();
  for (const r of historyRecords) {
    try {
      const mid = (JSON.parse(r.messageJson) as { id?: string }).id;
      if (mid) existingIds.add(mid);
    } catch { /* 忽略无法解析的存量记录 */ }
  }
  for (const msg of incoming) {
    const msgId = msg.id;
    if (msgId && existingIds.has(msgId)) continue;
    insertMessage(convId, msg.role, JSON.stringify(msg));
    if (msgId) existingIds.add(msgId);
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
      // 分层 system prompt：基础提示 + 当前记忆块 + 会话结构化状态
      const memoryBlocks = listMemoryBlocks();
      const sessionState = getSessionState(convId);
      const instructions = buildSystemPrompt({
        memoryBlocks,
        sessionState: sessionState ? sessionState.stateJson : null,
      });
      const agent = new ToolLoopAgent({
        model: getModel(),
        instructions,
        tools: getTools(),
        stopWhen: isStepCount(5),
        onToolExecutionStart: ({ toolCall }) => {
          const toolName = toolCall.toolName;
          const progressText = toolName === 'importResume' ? '正在读取简历…'
            : toolName === 'analyzeResume' ? '正在分析简历…'
            : toolName === 'importJobOpportunity' ? '正在保存岗位信息…'
            : toolName === 'matchJob' ? '正在匹配岗位…'
            : toolName === 'discoverChannels' ? '正在发现投递渠道…'
            : toolName === 'tailoredResume' ? '正在生成专属简历…'
            : toolName === 'applyJob' ? '正在更新投递状态…'
            : toolName === 'recordApplicationStatus' ? '正在记录投递后状态…'
            : toolName === 'prepareInterview' ? '正在准备面试…'
            : '正在处理…';
          writer.write({
            type: 'data-tool-progress',
            data: { toolName, status: 'running', message: progressText },
            transient: true,
          });
        },
        onToolExecutionEnd: ({ toolCall, toolOutput }) => {
          const toolName = toolCall.toolName;
          const success = toolOutput.type === 'tool-result';
          writer.write({
            type: 'data-tool-progress',
            data: {
              toolName,
              status: success ? 'completed' : 'failed',
              message: success ? '完成' : '失败',
            },
            transient: true,
          });
          // 工具成功执行后回写会话状态（导入/分析/匹配成功 → currentJobId / currentResumeId）
          if (success) {
            const patch = sessionStatePatchFromTool(toolName, toolOutput.output);
            if (patch) persistSessionState(convId, patch);
          }
        },
      });

      const stream = await createAgentUIStream({ agent, uiMessages: trimmed });
      const [clientSide, collectSide] = stream.tee();
      const collected: UIMessage[] = [];
      const collector = (async () => {
        for await (const msg of readUIMessageStream({ stream: collectSide })) {
          collected.push(msg);
        }
        const byId = new Map<string, UIMessage>();
        for (const m of collected) byId.set(m.id, m);
        for (const m of byId.values()) {
          if (m.role === 'assistant') {
            // 服务端生成的 UIMessage 可能无 id（id 由客户端 useChat 生成）：
            // 持久化前补 UUID，避免恢复时 React key 冲突
            const withId = m.id ? m : { ...m, id: randomUUID() };
            insertMessage(convId, 'assistant', JSON.stringify(withId));
          }
        }
        touchConversation(convId);
      })();
      writer.merge(clientSide);
      await collector;
    },
  });

  return createUIMessageStreamResponse({ stream });
}
