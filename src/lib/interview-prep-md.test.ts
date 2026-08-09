import { describe, expect, it } from 'vitest';
import { toInterviewPrepMarkdown } from './interview-prep-md';

const sample = {
  schemaVersion: 1,
  companyBrief: '云雀科技 · 高级前端工程师：负责 React 应用架构与性能优化。',
  selfIntro: '你好，我是张三，5 年前端经验，主要使用 React 与 TypeScript。',
  questions: [
    {
      id: 'q1', question: '讲一下你最复杂的前端项目',
      intent: '考察技术深度与项目经验',
      answerPoints: ['按 STAR 描述项目背景与难点', '突出架构设计与性能优化'],
      evidence: '简历项目经历：自研组件库支撑 3 个业务线',
      risk: null,
    },
    {
      id: 'q2', question: '你如何处理项目延期',
      intent: '考察沟通与项目管理',
      answerPoints: ['先说评估与拆解', '再谈透明同步'],
      evidence: null,
      risk: '简历无项目延期处理经验，建议补充真实案例',
    },
  ],
  askThem: ['团队目前的技术栈演进方向？', '这个岗位的考核重点？'],
};

describe('interview-prep-md', () => {
  it('包含标题与背景要点节', () => {
    const md = toInterviewPrepMarkdown(sample);
    expect(md).toContain('# 面试准备');
    expect(md).toContain('## 公司与岗位背景');
    expect(md).toContain('云雀科技 · 高级前端工程师：负责 React 应用架构与性能优化。');
  });
  it('包含自我介绍节与话术', () => {
    const md = toInterviewPrepMarkdown(sample);
    expect(md).toContain('## 自我介绍');
    expect(md).toContain('你好，我是张三，5 年前端经验，主要使用 React 与 TypeScript。');
  });
  it('预测问题渲染考察意图与应答要点', () => {
    const md = toInterviewPrepMarkdown(sample);
    expect(md).toContain('### q1 讲一下你最复杂的前端项目');
    expect(md).toContain('考察意图：考察技术深度与项目经验');
    expect(md).toContain('- 按 STAR 描述项目背景与难点');
    expect(md).toContain('简历证据：简历项目经历：自研组件库支撑 3 个业务线');
  });
  it('无证据问题渲染风险提示', () => {
    const md = toInterviewPrepMarkdown(sample);
    expect(md).toContain('### q2 你如何处理项目延期');
    expect(md).toContain('风险提示：简历无项目延期处理经验，建议补充真实案例');
  });
  it('包含向面试官提问节', () => {
    const md = toInterviewPrepMarkdown(sample);
    expect(md).toContain('## 向面试官提问');
    expect(md).toContain('- 团队目前的技术栈演进方向？');
  });
});
