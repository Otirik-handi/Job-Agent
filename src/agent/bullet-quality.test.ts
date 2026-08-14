import { describe, expect, it } from 'vitest';
import { validateBulletQuality } from './bullet-quality';

describe('validateBulletQuality', () => {
  it('弱表述且无数字的 bullet 被标记（缺数字 + 弱动词）', () => {
    const warnings = validateBulletQuality([{ id: 'e1', suggestedText: '负责电商平台前端开发' }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].editId).toBe('e1');
    expect(warnings[0].issues.join('')).toContain('缺少数字');
    expect(warnings[0].issues.join('')).toContain('弱动词');
  });

  it('X-Y-Z 完整改写（强动词 + 数字 + 基线）不产生警告', () => {
    const warnings = validateBulletQuality([{ id: 'e2', suggestedText: '主导电商平台组件库建设，性能提升 40%（从 2s 到 1.2s）' }]);
    expect(warnings).toEqual([]);
  });

  it('长度过长标记', () => {
    const long = '主导了一个覆盖多个业务线的大型组件库建设，'.repeat(6) + '并带来 20% 的性能提升';
    const warnings = validateBulletQuality([{ id: 'e1', suggestedText: long }]);
    expect(warnings[0].issues.join('')).toContain('表述过长');
  });

  it('数字过多（>3 个）标记', () => {
    const warnings = validateBulletQuality([{ id: 'e1', suggestedText: '带领 12 人团队，管理 5 个项目，覆盖 3 个城市，服务 200 客户，收入提升 30%' }]);
    expect(warnings[0].issues.join('')).toContain('数字过多');
  });

  it('百分比无基线标记（有基线不标记）', () => {
    const noBaseline = validateBulletQuality([{ id: 'e1', suggestedText: '主导组件库建设，性能提升 40%' }]);
    expect(noBaseline[0].issues.join('')).toContain('百分比缺少基线');
    const withBaseline = validateBulletQuality([{ id: 'e2', suggestedText: '主导组件库建设，性能从 2s 提升 40%' }]);
    expect(withBaseline).toEqual([]);
  });

  it('全角数字视为数字', () => {
    const warnings = validateBulletQuality([{ id: 'e1', suggestedText: '主导组件库建设，覆盖１２个模块' }]);
    expect(warnings).toEqual([]);
  });

  it('空清单返回空数组', () => {
    expect(validateBulletQuality([])).toEqual([]);
  });
});
