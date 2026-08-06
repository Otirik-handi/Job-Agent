import { describe, expect, it } from 'vitest';
import { applyStateTransition } from './apply-state';

describe('apply-state: apply 动作', () => {
  it('matched → applying', () => {
    expect(applyStateTransition('matched', 'apply')).toEqual({ ok: true, next: 'applying' });
  });
  it('applying → applied', () => {
    expect(applyStateTransition('applying', 'apply')).toEqual({ ok: true, next: 'applied' });
  });
  it('saved/analyzed 未匹配投递 → JOB_MATCH_REQUIRED', () => {
    expect(applyStateTransition('saved', 'apply')).toEqual({ ok: false, code: 'JOB_MATCH_REQUIRED' });
    expect(applyStateTransition('analyzed', 'apply')).toEqual({ ok: false, code: 'JOB_MATCH_REQUIRED' });
  });
  it('applied/skipped 再投递 → STATUS_TRANSITION_INVALID', () => {
    expect(applyStateTransition('applied', 'apply')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
    expect(applyStateTransition('skipped', 'apply')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
  });
});

describe('apply-state: skip 动作', () => {
  it('非终态 → skipped', () => {
    for (const s of ['saved', 'analyzed', 'matched', 'applying']) {
      expect(applyStateTransition(s, 'skip')).toEqual({ ok: true, next: 'skipped' });
    }
  });
  it('applied 不可跳过 → STATUS_TRANSITION_INVALID', () => {
    expect(applyStateTransition('applied', 'skip')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
  });
});
