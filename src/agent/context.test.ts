import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, type MemoryBlock } from './context';

const base = { memoryBlocks: [] as MemoryBlock[], sessionState: null };

describe('buildSystemPrompt 历史摘要段', () => {
  it('无 summary 时输出占位「（暂无历史摘要）」，不注入内容', () => {
    const prompt = buildSystemPrompt(base);
    expect(prompt).toContain('历史摘要：');
    expect(prompt).toContain('（暂无历史摘要）');
    expect(prompt).not.toContain('历史摘要：\n用户');
  });

  it('有 summary 时注入摘要文本', () => {
    const prompt = buildSystemPrompt({ ...base, conversationSummary: '用户偏向后端岗位，已投递 A 公司' });
    expect(prompt).toContain('历史摘要：\n用户偏向后端岗位，已投递 A 公司');
  });

  it('摘要段位于稳定段（Skill）之后、会话状态段之前', () => {
    const prompt = buildSystemPrompt({ ...base, conversationSummary: '摘要内容' });
    const skillIdx = prompt.indexOf('Skill 技能库');
    const summaryIdx = prompt.indexOf('历史摘要');
    const stateIdx = prompt.indexOf('当前会话状态');
    expect(skillIdx).toBeGreaterThanOrEqual(0);
    expect(summaryIdx).toBeGreaterThan(skillIdx);
    expect(stateIdx).toBeGreaterThan(summaryIdx);
  });
});
