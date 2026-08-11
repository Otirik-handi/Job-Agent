import type { UIMessage } from 'ai';
import type { MockResponse } from '../mock-model';

export type ScenarioContext = {
  /** 原生 SQL 查询（返回第一行或 null；参数化） */
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null;
  /** 原生 SQL 执行（写操作） */
  exec: (sql: string, params?: unknown[]) => void;
  /** 全部轮次的 assistant 消息文本（按顺序拼接） */
  allAssistantText: () => string;
};

export type Scenario = {
  id: string;
  family: 'high-frequency' | 'orchestration' | 'recovery';
  description: string;
  /** 在临时库注入初始数据（固定 id 约定：resume-eval-1 / job-eval-1 …） */
  setup: (ctx: ScenarioContext) => void;
  /** 依次作为用户消息走完整 Agent 循环 */
  userMessages: string[];
  /** mock 层专用：全场景调用序列（跨轮累计；含工具内部 callStructured 调用） */
  mockScript: MockResponse[];
  /** 终态断言（DB + 消息流；vitest expect 直接使用） */
  assertFinalState: (ctx: ScenarioContext) => void;
};

/** 把用户文本构造成 UIMessage */
export function toUserMessage(text: string, index: number): UIMessage {
  return { id: `eval-user-${index}`, role: 'user', parts: [{ type: 'text', text }] };
}
