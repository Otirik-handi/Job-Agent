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
