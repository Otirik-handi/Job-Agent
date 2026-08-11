import { expect } from 'vitest';
import type { Scenario } from './types';

export const offerCompareScenario: Scenario = {
  id: 'offer-compare',
  family: 'high-frequency',
  description: '两个 offer 对比 → readSkill(offer-evaluation) 后输出对比建议',
  setup: () => { /* 纯知识问答，无需初始数据 */ },
  userMessages: ['我现在有两个 offer：A 公司 25k 双休 vs B 公司 30k 大小周，都在北京，帮我对比下'],
  mockScript: [
    { type: 'tool-call', toolName: 'readSkill', input: { skillName: 'offer-evaluation' } },
    { type: 'text', text: '对比建议：A 公司 25k 双休，时薪与生活质量更优；B 公司 30k 大小周，月薪多 5k 但每月多上约 4 天班。建议结合成长空间、通勤与公积金基数综合判断。' },
  ],
  assertFinalState: (ctx) => {
    expect(ctx.allAssistantText()).toContain('25k');
    expect(ctx.allAssistantText()).toContain('30k');
  },
};
