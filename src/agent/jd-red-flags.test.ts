import { describe, expect, it } from 'vitest';
import { RED_FLAG_RULES, detectJdRedFlags, fitBandFromScore } from './jd-red-flags';

describe('detectJdRedFlags', () => {
  it('命中中文本地化短语（workload）', () => {
    const hits = detectJdRedFlags('要求候选人身兼多职，能适应快节奏环境');
    expect(hits.map((h) => h.category)).toEqual(['workload', 'workload']);
    expect(hits[0].phrase).toBe('身兼多职');
    expect(hits[1].phrase).toBe('快节奏');
    expect(hits[0].label).toContain('一人多岗');
  });

  it('命中英文原句且忽略大小写', () => {
    const hits = detectJdRedFlags('We need a Rockstar engineer. Fast-Paced environment, DOE.');
    expect(hits.map((h) => h.category)).toEqual(['workload', 'culture', 'compensation']);
    expect(hits[0].phrase).toBe('fast-paced environment');
    expect(hits[1].phrase).toBe('rockstar');
    expect(hits[2].phrase).toBe('doe');
  });

  it('三类清单覆盖 12 条规则（封闭清单不缩水）', () => {
    expect(RED_FLAG_RULES).toHaveLength(12);
    const categories = new Set(RED_FLAG_RULES.map((r) => r.category));
    expect(categories).toEqual(new Set(['workload', 'culture', 'compensation']));
  });

  it('每条规则至少有一个中文短语变体（本地化要求）', () => {
    for (const rule of RED_FLAG_RULES) {
      expect(rule.phrases.some((p) => /[\u4e00-\u9fa5]/.test(p)), rule.label).toBe(true);
    }
  });

  it('无危险信号文本返回空数组', () => {
    expect(detectJdRedFlags('招聘高级前端工程师，5 年经验，本科以上')).toEqual([]);
    expect(detectJdRedFlags('')).toEqual([]);
  });

  it('薪酬面议类短语命中', () => {
    const hits = detectJdRedFlags('薪资面议，视经验而定');
    expect(hits).toHaveLength(1);
    expect(hits[0].category).toBe('compensation');
    expect(hits[0].phrase).toBe('薪资面议');
  });

  it('「自驱」单独出现不误报（仅匹配完整短语）', () => {
    expect(detectJdRedFlags('要求自我驱动、结果导向')).toEqual([]);
  });
});

describe('fitBandFromScore', () => {
  it('按区间映射（含边界值）', () => {
    expect(fitBandFromScore(100)).toBe('overqualified');
    expect(fitBandFromScore(90)).toBe('overqualified');
    expect(fitBandFromScore(89)).toBe('excellent');
    expect(fitBandFromScore(75)).toBe('excellent');
    expect(fitBandFromScore(74)).toBe('good');
    expect(fitBandFromScore(60)).toBe('good');
    expect(fitBandFromScore(59)).toBe('stretch');
    expect(fitBandFromScore(50)).toBe('stretch');
    expect(fitBandFromScore(49)).toBe('underqualified');
    expect(fitBandFromScore(0)).toBe('underqualified');
  });
});
