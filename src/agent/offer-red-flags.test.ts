import { describe, expect, it } from 'vitest';
import { offerRedFlagCheck } from './offer-red-flags';

describe('offerRedFlagCheck（确定性红旗硬性项）', () => {
  it('模糊奖金话术（最高 X%）命中', () => {
    const hits = offerRedFlagCheck('base 25k × 14，年终奖最高 3 个月');
    expect(hits.map((h) => h.category)).toContain('offer');
    expect(hits[0].label).toContain('上限或区间');
  });

  it('期权无归属条款命中（有归属条款不命中）', () => {
    const noVest = offerRedFlagCheck('另有期权 2 万股');
    expect(noVest.map((h) => h.label).join()).toContain('期权/股票未提及归属');
    const withVest = offerRedFlagCheck('期权 2 万股，分 4 年归属，含回购条款');
    expect(withVest.map((h) => h.label).join()).not.toContain('期权/股票未提及归属');
  });

  it('竞业限制命中', () => {
    expect(offerRedFlagCheck('入职需签竞业限制协议').some((h) => h.label.includes('竞业'))).toBe(true);
  });

  it('口头承诺命中', () => {
    expect(offerRedFlagCheck('HR 口头承诺年终 5 个月').some((h) => h.label.includes('口头承诺'))).toBe(true);
  });

  it('年终浮动（视绩效）命中', () => {
    expect(offerRedFlagCheck('年终奖视绩效而定，不保证').some((h) => h.label.includes('年终奖浮动'))).toBe(true);
  });

  it('长试用期命中（6 个月/半年）', () => {
    expect(offerRedFlagCheck('试用期 6 个月，薪资 8 折').some((h) => h.label.includes('试用期'))).toBe(true);
    expect(offerRedFlagCheck('试用期半年，转正后调薪').some((h) => h.label.includes('试用期'))).toBe(true);
  });

  it('职责模糊命中', () => {
    expect(offerRedFlagCheck('岗位职责宽泛，什么都做').some((h) => h.label.includes('职责'))).toBe(true);
  });

  it('健康 offer 描述无命中', () => {
    const hits = offerRedFlagCheck('base 25k × 14，年终保底 2 个月，期权分 4 年归属含回购，试用期 3 个月');
    expect(hits).toEqual([]);
  });

  it('空文本不抛错', () => {
    expect(offerRedFlagCheck('')).toEqual([]);
  });
});
