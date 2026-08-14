import { expect } from 'vitest';
import type { Scenario } from './types';

/**
 * 意图澄清协议场景（吸收 refine-07 interview-me，方案一 prompt 层落地）：
 * 用户指令"帮我优化一下简历"缺关键要素（目标岗位/所用简历）——Agent 必须先澄清
 * （HYPOTHESIS + CONFIDENCE + 单问单猜），不调用任何业务工具；空库起步，无简历可默认。
 */
export const intentClarifyScenario: Scenario = {
  id: 'intent-clarify',
  family: 'orchestration',
  description: '模糊指令（无岗位/简历上下文）→ Agent 先澄清再行动，不调用业务工具',
  setup: () => { /* 空库起步：无简历无岗位，澄清是唯一正确路径 */ },
  userMessages: ['帮我优化一下简历'],
  mockScript: [
    // 首轮必须输出澄清（文本），不得调用工具；若 Agent 先调工具，mock 会按顺序返回文本导致失败
    {
      type: 'text',
      text: 'HYPOTHESIS：你希望针对某个目标岗位优化简历，让它更匹配岗位要求。\nCONFIDENCE：~40% —— 缺：目标岗位方向、用哪份简历。\nQ：这次优化是针对哪个岗位方向？\nGUESS：我猜是前端开发岗（如果不对请纠正我）。',
    },
  ],
  assertFinalState: (ctx) => {
    // 未调用任何业务工具：空库仍无简历（未 analyzeResume/importResume）、无岗位（未 importJobOpportunity）
    const resumes = ctx.query<{ c: number }>('SELECT count(*) AS c FROM resumes');
    expect(resumes?.c).toBe(0);
    const jobs = ctx.query<{ c: number }>('SELECT count(*) AS c FROM job_opportunities');
    expect(jobs?.c).toBe(0);
    // 澄清格式要素：假设 + 置信度 + 单问
    const text = ctx.allAssistantText();
    expect(text).toMatch(/HYPOTHESIS|假设/i);
    expect(text).toMatch(/CONFIDENCE|置信度/i);
  },
  assertFinalStateReal: (ctx) => {
    // 真实模型行为观察：要求先澄清后行动（未落库业务数据）；若模型直接尝试调用工具会因空库失败而回到澄清
    const resumes = ctx.query<{ c: number }>('SELECT count(*) AS c FROM resumes');
    expect(resumes?.c).toBe(0);
    const jobs = ctx.query<{ c: number }>('SELECT count(*) AS c FROM job_opportunities');
    expect(jobs?.c).toBe(0);
    expect(ctx.allAssistantText()).not.toBe('');
  },
};
