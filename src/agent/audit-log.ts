/** 工具执行 → 审计记录映射（纯函数，可单测）：白名单动作映射 + entity 提取 + 成败判定。
 * 设计：actions 表记"动作执行与成败"，只读工具/第一段预览不记录（噪声 > 价值）。 */
type AuditAction = { action: string; entityType: string; entityId: string; result: string };

const ACTION_MAP: Record<string, { action: string; entityType: string; entityIdFrom: (o: Record<string, unknown>) => string }> = {
  applyJob: {
    action: 'apply_job', entityType: 'job_opportunity',
    entityIdFrom: (o) => (typeof o.jobOpportunityId === 'string' ? o.jobOpportunityId : ''),
  },
  recordApplicationStatus: {
    action: 'record_status', entityType: 'job_opportunity',
    entityIdFrom: (o) => (typeof o.jobOpportunityId === 'string' ? o.jobOpportunityId : ''),
  },
  tailoredResume: {
    action: 'tailored_resume', entityType: 'tailored_resume',
    entityIdFrom: (o) => (typeof o.tailoredResumeId === 'string' ? o.tailoredResumeId : ''),
  },
  importResume: {
    action: 'import_resume', entityType: 'resume',
    entityIdFrom: (o) => (typeof o.resumeId === 'string' ? o.resumeId : ''),
  },
  importJobOpportunity: {
    action: 'import_job', entityType: 'job_opportunity',
    entityIdFrom: (o) => (typeof o.jobOpportunityId === 'string' ? o.jobOpportunityId : ''),
  },
  planCreate: {
    action: 'plan_create', entityType: 'plan',
    entityIdFrom: (o) => (typeof o.taskId === 'string' ? o.taskId : ''),
  },
  planUpdate: {
    action: 'plan_update', entityType: 'plan',
    entityIdFrom: (o) => (typeof o.taskId === 'string' ? o.taskId : ''),
  },
};

/** 两段式工具第一段（preview/suggestions，未落库）不记录 */
function isPreviewPhase(output: Record<string, unknown>): boolean {
  return output.phase === 'preview' || output.phase === 'suggestions';
}

/** 工具输出 → 审计记录；白名单外 / 只读 / 第一段 → null（不记录） */
export function mapToolToAction(toolName: string, rawOutput: unknown): AuditAction | null {
  if (typeof rawOutput !== 'object' || rawOutput === null) return null;
  const output = rawOutput as Record<string, unknown>;
  const def = ACTION_MAP[toolName];
  if (!def) return null;
  if (isPreviewPhase(output)) return null;
  const failed = output.ok === false;
  const errorCode = failed && typeof output.error === 'object' && output.error !== null
    ? (output.error as { code?: unknown }).code
    : undefined;
  return {
    action: def.action,
    entityType: def.entityType,
    entityId: def.entityIdFrom(output),
    result: typeof errorCode === 'string' ? errorCode : 'ok',
  };
}
