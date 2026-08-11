import { expect } from 'vitest';
import type { Scenario } from './types';

export const coverLetterScenario: Scenario = {
  id: 'cover-letter',
  family: 'high-frequency',
  description: '针对岗位写求职信 → readSkill(cover-letter-generation) 后产出求职信',
  setup: () => { /* 纯知识问答 */ },
  userMessages: ['帮我对 XX 科技的高级前端工程师岗位写一封求职信'],
  mockScript: [
    { type: 'tool-call', toolName: 'readSkill', input: { skillName: 'cover-letter-generation' } },
    { type: 'text', text: '尊敬的招聘团队：\n您好！我是张伟，一名有 5 年经验的前端工程师，看到贵司高级前端工程师岗位后非常感兴趣……\n此致敬礼' },
  ],
  assertFinalState: (ctx) => {
    const text = ctx.allAssistantText();
    expect(text).toContain('尊敬的');
    expect(text).toContain('前端');
  },
};
