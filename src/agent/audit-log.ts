/** 工具执行 → 审计记录映射（纯函数，可单测）：白名单动作映射 + entity 提取 + 成败判定。
 * 设计：actions 表记"动作执行与成败"，只读工具/第一段预览不记录（噪声 > 价值）。
 * details 提取（2026-08-14，吸收 refine-06 投递-版本关联）：apply_job 携带所用专属简历版本。 */
type AuditAction = {
  action: string; entityType: string; entityId: string; result: string;
  detailsJson?: string;
};

type AuditDef = {
  action: string; entityType: string;
  entityIdFrom: (o: Record<string, unknown>) => string;
  /** 可选：从工具输出提取结构化明细（JSON 序列化后写入 actions.details_json） */
  detailsFrom?: (o: Record<string, unknown>) => Record<string, unknown> | null;
};

const ACTION_MAP: Record<string, AuditDef> = {
  applyJob: {
    action: 'apply_job', entityType: 'job_opportunity',
    entityIdFrom: (o) => (typeof o.jobOpportunityId === 'string' ? o.jobOpportunityId : ''),
    // 投递关联明细：投递时所用专属简历版本（applyJob 第二段落库时查最新专属简历并携带）；
    // 无版本（未生成专属简历/存量投递）→ 不写明细
    detailsFrom: (o) => {
      const tailoredResumeId = typeof o.tailoredResumeId === 'string' ? o.tailoredResumeId : '';
      if (!tailoredResumeId) return null;
      return {
        tailoredResumeId,
        tailoredResumeVersion: typeof o.tailoredResumeVersion === 'number' ? o.tailoredResumeVersion : null,
      };
    },
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
  const record: AuditAction = {
    action: def.action,
    entityType: def.entityType,
    entityId: def.entityIdFrom(output),
    result: typeof errorCode === 'string' ? errorCode : 'ok',
  };
  const details = def.detailsFrom?.(output);
  if (details && record.result === 'ok') record.detailsJson = JSON.stringify(details);
  return record;
}
