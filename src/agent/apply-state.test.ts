import { describe, expect, it } from 'vitest';
import { applyStateTransition, applicationOutcomeTransition } from './apply-state';

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

describe('apply-state: applicationOutcomeTransition 合法链', () => {
  it('applied → interview', () => {
    expect(applicationOutcomeTransition('applied', 'interview')).toEqual({ ok: true, next: 'interview' });
  });
  it('interview → offer', () => {
    expect(applicationOutcomeTransition('interview', 'offer')).toEqual({ ok: true, next: 'offer' });
  });
  it('offer → hired', () => {
    expect(applicationOutcomeTransition('offer', 'hired')).toEqual({ ok: true, next: 'hired' });
  });
  it('applied/interview/offer → rejected', () => {
    expect(applicationOutcomeTransition('applied', 'rejected')).toEqual({ ok: true, next: 'rejected' });
    expect(applicationOutcomeTransition('interview', 'rejected')).toEqual({ ok: true, next: 'rejected' });
    expect(applicationOutcomeTransition('offer', 'rejected')).toEqual({ ok: true, next: 'rejected' });
  });
});

describe('apply-state: applicationOutcomeTransition 非法转移', () => {
  it('跳过中间态（applied→offer/hired、interview→hired）→ STATUS_TRANSITION_INVALID', () => {
    expect(applicationOutcomeTransition('applied', 'offer')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
    expect(applicationOutcomeTransition('applied', 'hired')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
    expect(applicationOutcomeTransition('interview', 'hired')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
  });
  it('回退（offer→interview、interview→applied）→ STATUS_TRANSITION_INVALID', () => {
    expect(applicationOutcomeTransition('offer', 'interview')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
    expect(applicationOutcomeTransition('interview', 'applied')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
  });
  it('终态（rejected/hired）再记录 → STATUS_TRANSITION_INVALID', () => {
    expect(applicationOutcomeTransition('rejected', 'interview')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
    expect(applicationOutcomeTransition('hired', 'rejected')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
  });
  it('未投递（saved/analyzed/matched/applying/skipped）→ NOT_APPLIED', () => {
    for (const s of ['saved', 'analyzed', 'matched', 'applying', 'skipped']) {
      expect(applicationOutcomeTransition(s, 'interview')).toEqual({ ok: false, code: 'NOT_APPLIED' });
    }
  });
});
