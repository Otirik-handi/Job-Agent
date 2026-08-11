import {
  createAgentUIStream,
  isStepCount,
  readUIMessageStream,
  ToolLoopAgent,
  type InferUIMessageChunk,
  type UIMessage,
} from 'ai';
import type { LanguageModel } from 'ai';
import { randomUUID } from 'node:crypto';
import { getModel } from './model';
import { getTools } from './agent';
import { buildSystemPrompt } from './context';
import { MAX_HISTORY_ROUNDS, maybeGenerateSummary } from './summary';
import { touchConversation } from '../db/repositories/conversations';
import { insertMessage, listMessages } from '../db/repositories/messages';
import { listMemoryBlocks } from '../db/repositories/memory-blocks';
import { getSessionState, setSessionState } from '../db/repositories/session-state';

export type SessionStatePatch = { currentResumeId?: string; currentJobId?: string };

/** 从工具成功结果中提取会话状态补丁；无法提取时返回 null（其他工具成功不更新状态） */
export function sessionStatePatchFromTool(toolName: string, output: unknown): SessionStatePatch | null {
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

export type ToolProgressEvent = {
  toolName: string;
  status: 'running' | 'completed' | 'failed';
  message: string;
};

export type AgentTurnResult = {
  conversationId: string;
  /** 本轮新增的 assistant 消息（含工具调用过程） */
  messages: UIMessage[];
};

const TOOL_PROGRESS_TEXT: Record<string, string> = {
  importResume: '正在读取简历…',
  analyzeResume: '正在分析简历…',
  importJobOpportunity: '正在保存岗位信息…',
  matchJob: '正在匹配岗位…',
  discoverChannels: '正在发现投递渠道…',
  tailoredResume: '正在生成专属简历…',
  applyJob: '正在更新投递状态…',
  recordApplicationStatus: '正在记录投递后状态…',
  prepareInterview: '正在准备面试…',
};

/** 工具业务失败判定：{ ok:false, error } 结构化错误结果视为失败（对齐 createDomainTool 契约） */
export function isBusinessFailure(toolOutput: unknown): boolean {
  return (
    typeof toolOutput === 'object' &&
    toolOutput !== null &&
    (toolOutput as { ok?: unknown }).ok === false
  );
}

/**
 * Agent 回合核心：查历史 → 合并去重 → 截断 → 组装分层 prompt → ToolLoopAgent 循环
 * → 收集输出 → 持久化 → 返回新增 assistant 消息。route 与评测 runner 共用。
 * 业务逻辑与 route.ts 原 POST 等价（进度事件经 onToolProgress 回调交给路由层渲染）。
 */
export async function runAgentTurn(options: {
  conversationId: string;
  messages: UIMessage[];
  model?: LanguageModel;
  onToolProgress?: (event: ToolProgressEvent) => void;
  /**
   * 客户端流分支回调（tee 后同步触发，与内部收集并行消费）：route 层在此 merge 进响应流，
   * 保持「边生成边推流」的原有时序；评测 runner 不传（tee 未读分支自动缓冲，无副作用）。
   */
  onClientStream?: (stream: ReadableStream<InferUIMessageChunk<UIMessage>>) => void;
}): Promise<AgentTurnResult> {
  const { conversationId, messages: incoming, model = getModel(), onToolProgress, onClientStream } = options;

  // 注意：history 在入站消息落库前读取（与 route 原 POST 顺序一致），摘要触发/去重都以这份为准
  const historyRecords = listMessages(conversationId);
  const history: UIMessage[] = historyRecords
    .map((r) => {
      try { return JSON.parse(r.messageJson) as UIMessage; } catch { return null; }
    })
    .filter((m): m is UIMessage => m !== null);
  const merged = [...history, ...incoming];
  const trimmed = merged.slice(-MAX_HISTORY_ROUNDS * 2);

  // 入站消息按 id 去重：多步 Agent 循环中客户端会自动重发消息历史，避免同 id 重复记录
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
    insertMessage(conversationId, msg.role, JSON.stringify(msg));
    if (msgId) existingIds.add(msgId);
  }

  // 分层 system prompt：基础提示 + 当前记忆块 + 会话级摘要（首次截断时生成，常驻注入）+ 会话结构化状态
  const memoryBlocks = listMemoryBlocks();
  const sessionState = getSessionState(conversationId);
  // 摘要生成/读取走降级通道：失败不影响本次请求（内部不抛错）
  const conversationSummary = await maybeGenerateSummary(conversationId, historyRecords);
  const instructions = buildSystemPrompt({
    memoryBlocks,
    sessionState: sessionState ? sessionState.stateJson : null,
    conversationSummary,
  });

  const agent = new ToolLoopAgent({
    model,
    instructions,
    tools: getTools(),
    stopWhen: isStepCount(5),
    onToolExecutionStart: ({ toolCall }) => {
      if (onToolProgress) {
        onToolProgress({
          toolName: toolCall.toolName,
          status: 'running',
          message: TOOL_PROGRESS_TEXT[toolCall.toolName] ?? '正在处理…',
        });
      }
    },
    onToolExecutionEnd: ({ toolCall, toolOutput }) => {
      const toolName = toolCall.toolName;
      // 业务失败（{ ok:false, error } 结构化错误结果）与抛异常同等视为失败
      const success = toolOutput.type === 'tool-result' && !isBusinessFailure(toolOutput.output);
      if (onToolProgress) {
        onToolProgress({
          toolName,
          status: success ? 'completed' : 'failed',
          message: success ? '完成' : '失败',
        });
      }
      // 工具成功执行后回写会话状态（导入/分析/匹配成功 → currentJobId / currentResumeId）
      if (success) {
        const patch = sessionStatePatchFromTool(toolName, toolOutput.output);
        if (patch) persistSessionState(conversationId, patch);
      }
    },
  });

  const stream = await createAgentUIStream({ agent, uiMessages: trimmed });
  const [clientSide, collectSide] = stream.tee();
  // 立即把客户端分支交给回调（route 层 merge 进响应流）：与下方 collector 并行消费
  // tee 两分支，恢复原实现「边生成边推流」时序；不传回调时该分支自动缓冲，无副作用
  if (onClientStream) onClientStream(clientSide);
  const collected: UIMessage[] = [];
  const collector = (async () => {
    for await (const msg of readUIMessageStream({ stream: collectSide })) {
      collected.push(msg);
    }
    const byId = new Map<string, UIMessage>();
    for (const m of collected) byId.set(m.id, m);
    for (const m of byId.values()) {
      if (m.role === 'assistant') {
        // 服务端生成的 UIMessage 可能无 id（id 由客户端 useChat 生成）：持久化前补 UUID
        const withId = m.id ? m : { ...m, id: randomUUID() };
        insertMessage(conversationId, 'assistant', JSON.stringify(withId));
      }
    }
    touchConversation(conversationId);
  })();
  await collector;

  const byId = new Map<string, UIMessage>();
  for (const m of collected) byId.set(m.id, m);
  return {
    conversationId,
    messages: [...byId.values()].filter((m) => m.role === 'assistant'),
  };
}
