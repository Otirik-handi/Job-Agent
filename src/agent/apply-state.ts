export type ApplyAction = 'apply' | 'skip';

export type ApplyStateResult =
  | { ok: true; next: string }
  | { ok: false; code: 'JOB_MATCH_REQUIRED' | 'STATUS_TRANSITION_INVALID' };

/** 投递状态机转移规则（第 4 期设计第 2 节）：apply 推进、skip 跳过 */
export function applyStateTransition(status: string, action: ApplyAction): ApplyStateResult {
  if (action === 'apply') {
    if (status === 'matched') return { ok: true, next: 'applying' };
    if (status === 'applying') return { ok: true, next: 'applied' };
    if (status === 'saved' || status === 'analyzed') return { ok: false, code: 'JOB_MATCH_REQUIRED' };
    return { ok: false, code: 'STATUS_TRANSITION_INVALID' };
  }
  if (status === 'applied') return { ok: false, code: 'STATUS_TRANSITION_INVALID' };
  return { ok: true, next: 'skipped' };
}

export type OutcomeTarget = 'interview' | 'offer' | 'hired' | 'rejected';

export type OutcomeResult =
  | { ok: true; next: string }
  | { ok: false; code: 'NOT_APPLIED' | 'STATUS_TRANSITION_INVALID' };

/** 投递后状态转移规则（第 5 期设计第 2 节）：applied→interview→offer→hired 严格单向，任一→rejected；rejected/hired 终态 */
export function applicationOutcomeTransition(status: string, target: OutcomeTarget): OutcomeResult {
  if (status === 'rejected' || status === 'hired') return { ok: false, code: 'STATUS_TRANSITION_INVALID' };
  if (status !== 'applied' && status !== 'interview' && status !== 'offer') return { ok: false, code: 'NOT_APPLIED' };
  if (target === 'rejected') return { ok: true, next: 'rejected' };
  if (status === 'applied' && target === 'interview') return { ok: true, next: 'interview' };
  if (status === 'interview' && target === 'offer') return { ok: true, next: 'offer' };
  if (status === 'offer' && target === 'hired') return { ok: true, next: 'hired' };
  return { ok: false, code: 'STATUS_TRANSITION_INVALID' };
}
