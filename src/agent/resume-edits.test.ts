import { describe, expect, it } from 'vitest';
import { applyEdits, findUniqueMatch, validateEdits, type ResumeEdit } from './resume-edits';

const RESUME = '姓名：张三\n技能：JavaScript、React\n经历：三年电商前端开发';

const e = (id: string, sourceText: string, suggestedText: string): ResumeEdit => ({ id, sourceText, suggestedText });

describe('resume-edits: findUniqueMatch', () => {
  it('唯一匹配返回位置', () => {
    expect(findUniqueMatch(RESUME, 'JavaScript')).toEqual({ ok: true, index: 9 });
  });
  it('0 次匹配 → NOT_FOUND', () => {
    expect(findUniqueMatch(RESUME, 'Vue')).toEqual({ ok: false, code: 'EDIT_SOURCE_NOT_FOUND' });
  });
  it('2 次匹配 → AMBIGUOUS', () => {
    expect(findUniqueMatch('A\nA\nC', 'A')).toEqual({ ok: false, code: 'EDIT_SOURCE_AMBIGUOUS' });
  });
  it('空 sourceText → NOT_FOUND', () => {
    expect(findUniqueMatch(RESUME, '')).toEqual({ ok: false, code: 'EDIT_SOURCE_NOT_FOUND' });
  });
});

describe('resume-edits: validateEdits', () => {
  it('全部有效', () => {
    const { valid, invalid } = validateEdits(RESUME, [e('e1', 'JavaScript', 'TypeScript')]);
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(0);
  });
  it('部分无效：找不到/歧义分组', () => {
    const { valid, invalid } = validateEdits(RESUME, [
      e('e1', 'JavaScript', 'TypeScript'),
      e('e2', 'Vue', 'React'),
    ]);
    expect(valid.map((x) => x.id)).toEqual(['e1']);
    expect(invalid.map((x) => x.edit.id)).toEqual(['e2']);
    expect(invalid[0].code).toBe('EDIT_SOURCE_NOT_FOUND');
  });
  it('歧义片段 → AMBIGUOUS', () => {
    const { valid, invalid } = validateEdits('技能：JavaScript、JavaScript', [e('e3', 'JavaScript', 'TS')]);
    expect(valid).toHaveLength(0);
    expect(invalid.map((x) => x.edit.id)).toEqual(['e3']);
    expect(invalid[0].code).toBe('EDIT_SOURCE_AMBIGUOUS');
  });
  it('同 sourceText 被两条建议引用 → 第二条歧义失败', () => {
    const { valid, invalid } = validateEdits(RESUME, [
      e('e1', 'JavaScript', 'TypeScript'),
      e('e2', 'JavaScript', 'TS'),
    ]);
    expect(valid.map((x) => x.id)).toEqual(['e1']);
    expect(invalid.map((x) => x.edit.id)).toEqual(['e2']);
  });
});

describe('resume-edits: applyEdits', () => {
  it('单条替换', () => {
    const r = applyEdits(RESUME, [e('e1', 'JavaScript', 'TypeScript')]);
    expect(r).toMatchObject({ ok: true, appliedCount: 1 });
    if (r.ok) expect(r.markdown).toContain('TypeScript、React');
  });
  it('多条替换（从后往前避免位移）', () => {
    const r = applyEdits(RESUME, [
      e('e1', 'JavaScript', 'TypeScript'),
      e('e2', '三年电商前端开发', '五年电商与支付前端开发'),
    ]);
    expect(r).toMatchObject({ ok: true, appliedCount: 2 });
    if (r.ok) {
      expect(r.markdown).toContain('TypeScript、React');
      expect(r.markdown).toContain('五年电商与支付前端开发');
    }
  });
  it('任一失败整体不执行并返回失败清单', () => {
    const r = applyEdits(RESUME, [
      e('e1', 'JavaScript', 'TypeScript'),
      e('e2', 'Vue', 'React'),
    ]);
    expect(r).toMatchObject({ ok: false, code: 'EDIT_SOURCE_NOT_FOUND' });
    if (!r.ok) {
      expect(r.failedEdits.map((x) => x.id)).toEqual(['e2']);
    }
  });
  it('歧义失败', () => {
    const r = applyEdits('A\nA\nC', [e('e1', 'A', 'B')]);
    expect(r).toMatchObject({ ok: false, code: 'EDIT_SOURCE_AMBIGUOUS' });
  });
  it('空编辑清单：原文不变', () => {
    const r = applyEdits(RESUME, []);
    expect(r).toMatchObject({ ok: true, appliedCount: 0 });
    if (r.ok) expect(r.markdown).toBe(RESUME);
  });
});
