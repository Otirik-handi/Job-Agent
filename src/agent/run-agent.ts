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
import { sql } from 'drizzle-orm';
import { getModel } from './model';
import { getTools } from './agent';
import { buildSystemPrompt } from './context';
import { MAX_HISTORY_ROUNDS, maybeGenerateSummary } from './summary';
import { insertAction } from '../db/repositories/actions';
import { touchConversation } from '../db/repositories/conversations';
import { insertMessage, listMessages } from '../db/repositories/messages';
import { mapToolToAction } from './audit-log';
import { listMemoryBlocks } from '../db/repositories/memory-blocks';
import { getSessionState, setSessionState } from '../db/repositories/session-state';
import { embedText } from './embedding';
import { db } from '../db';
import { messages } from '../db/schema';

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

/** 按 id 归一化收集的消息：同 id 仅保留最后一条；无 id（含空串）补 randomUUID。
 * 持久化与返回值共用同一归一化结果——SDK 流中 assistant 消息 id 为空串，若两处各自
 * 处理会产生不同 UUID，导致返回 id 与 DB 对不上（评测 runner 比对会踩坑）。
 * 注意：仅入库/返回侧归一化；送入模型的 merged/trimmed 不去重（与原实现一致）。 */
function dedupeCollected(collected: UIMessage[]): UIMessage[] {
  const byId = new Map<string, UIMessage>();
  for (const m of collected) byId.set(m.id, m);
  return [...byId.values()].map((m) => (m.id ? m : { ...m, id: randomUUID() }));
}

/** 消息 JSON → 嵌入文本：text parts 拼接；无文本返回 null（不嵌入） */
export function extractEmbeddingText(messageJson: string): string | null {
  try {
    const msg = JSON.parse(messageJson) as { parts?: Array<{ type?: string; text?: string }> };
    const texts = (msg.parts ?? [])
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text);
    const joined = texts.join('\n').trim();
    return joined.length > 0 ? joined : null;
  } catch {
    return null;
  }
}

/** 落库后同步嵌入（失败降级：不阻塞主流程；override/未配置时跳过） */
async function embedMessage(recordId: string, messageJson: string): Promise<void> {
  try {
    const text = extractEmbeddingText(messageJson);
    if (!text) return;
    const vector = await embedText(text);
    if (vector) {
      db.update(messages).set({ embeddingJson: JSON.stringify(vector) }).where(sql`id = ${recordId}`).run();
    }
  } catch {
    // 嵌入失败仅跳过（消息本身可用），不刷日志（避免敏感信息/噪声）
  }
}

/**
 * Agent 回合核心：查历史 → 合并截断 + 入库去重 → 组装分层 prompt → ToolLoopAgent 循环
 * → 收集输出 → 持久化 → 返回新增 assistant 消息。route 与评测 runner 共用。
 * 业务逻辑与 route.ts 原 POST 等价（进度事件经 onToolProgress 回调交给路由层渲染）；
 * 注意 merged/trimmed 送模型时不去重（与原实现一致），id 去重只发生在入库/返回侧。
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
  // 与原 route 差异：原实现先落库入站消息、execute 内才取模型，LLM 配置错误时会留下
  // 「只有用户消息」的孤儿记录；此处默认参数在入口求值，配置错误整轮不落库，更合理

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
    const msgRecord = insertMessage(conversationId, msg.role, JSON.stringify(msg));
    void embedMessage(msgRecord.id, JSON.stringify(msg));
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
      // 审计记录（横切）：白名单动作写入 actions 表；失败不阻塞主流程（降级模式对齐 persistSessionState）
      try {
        if (toolOutput.type === 'tool-result') {
          const audit = mapToolToAction(toolName, toolOutput.output);
          if (audit) {
            insertAction({ conversationId, ...audit });
          }
        }
      } catch (err) {
        console.error(`[audit] 写入失败 conversationId=${conversationId} tool=${toolName}:`, err);
      }
    },
  });

  const stream = await createAgentUIStream({ agent, uiMessages: trimmed });
  const [clientSide, collectSide] = stream.tee();
  // 立即把客户端分支交给回调（route 层 merge 进响应流）：与下方 collector 并行消费
  // tee 两分支，恢复原实现「边生成边推流」时序；不传回调时该分支未读内容仅瞬时内存缓冲
  //（量与 collector 相当），runAgentTurn 返回后即被 GC，无持久成本
  if (onClientStream) onClientStream(clientSide);
  const collected: UIMessage[] = [];
  const collector = (async () => {
    for await (const msg of readUIMessageStream({ stream: collectSide })) {
      collected.push(msg);
    }
    // 归一化一次（按 id 去重 + 无 id 补 UUID），持久化与返回值共用同一结果，
    // 保证返回 id 与 DB 一致（SDK 流中 assistant 消息 id 为空串，两处各自处理会产生不同 UUID）
    const deduped = dedupeCollected(collected);
    for (const m of deduped) {
      if (m.role === 'assistant') {
        const withIdRecord = insertMessage(conversationId, 'assistant', JSON.stringify(m));
        // 同步等嵌入落库：保证 runAgentTurn 返回时 embedding 已写入（fail 时内部降级，不抛错）
        await embedMessage(withIdRecord.id, JSON.stringify(m));
      }
    }
    touchConversation(conversationId);
    return deduped;
  })();
  const deduped = await collector;

  return {
    conversationId,
    messages: deduped.filter((m) => m.role === 'assistant'),
  };
}
