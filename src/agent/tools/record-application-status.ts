import { createDomainTool } from '../tool-factory';
import { getJobOpportunity, updateJobApplication } from '../../db/repositories/job-opportunities';
import { recordStatusTransition } from '../../db/repositories/status-history';
import { recordApplicationStatusInputSchema } from '../schemas/record-application-status';
import { applicationOutcomeTransition } from '../apply-state';

const TARGET_LABELS: Record<string, string> = {
  interview: '面试中', offer: '拿到 offer', hired: '已入职', rejected: '已拒绝',
};

export const recordApplicationStatusTool = createDomainTool({
  name: 'recordApplicationStatus',
  description: '投递后状态记录：将已投递岗位推进到投递后阶段（applied→interview→offer→hired，或任一→rejected），两段式调用。参数：jobOpportunityId、target（interview 面试中 / offer 拿到 offer / hired 入职 / rejected 已拒绝）、confirmed（用户确认后传 true）。第一段不带 confirmed 仅返回变更摘要（当前/目标状态）不落库，须向用户呈现并请求确认；第二段携带 confirmed=true 校验前置条件后落库，其中岗位须已投递（未投递返回 NOT_APPLIED，先调用 applyJob 完成投递）。返回 ok、phase 与最新 status。',
  inputSchema: recordApplicationStatusInputSchema,
  progress: { start: '正在记录投递后状态…', done: '投递后状态已记录' },
  execute: async (args) => {
    const job = getJobOpportunity(args.jobOpportunityId);
    if (!job) {
      throw new Error('岗位不存在，请先调用 importJobOpportunity 导入');
    }

    const transition = applicationOutcomeTransition(job.status, args.target);
    if (!transition.ok) {
      return {
        ok: false,
        error: { code: transition.code, message: transition.code === 'NOT_APPLIED' ? '该岗位尚未投递，无法记录投递后状态' : `当前状态 ${job.status} 不能记录为 ${TARGET_LABELS[args.target]}` },
        jobOpportunityId: job.id,
        currentStatus: job.status,
        hint: transition.code === 'NOT_APPLIED'
          ? '请先调用 applyJob 完成投递，再记录投递后状态。'
          : `当前状态 ${job.status} 不能记录为 ${TARGET_LABELS[args.target]}，请检查目标状态是否正确。`,
      };
    }

    // —— 第一段：出变更摘要（不落库）——
    if (!args.confirmed) {
      return {
        ok: true,
        phase: 'preview',
        jobOpportunityId: job.id,
        currentStatus: job.status,
        targetStatus: transition.next,
        hint: `请向用户呈现变更摘要：将把岗位从 ${job.status} 记录为 ${TARGET_LABELS[transition.next]}（${transition.next}），并请求确认。用户确认后，携带 confirmed=true 再次调用本工具。`,
      };
    }

    // —— 第二段：状态推进落库 ——
    updateJobApplication(job.id, transition.next as 'interview' | 'offer' | 'hired' | 'rejected');
    // 落库成功后同步写入状态时序记录（只追加不覆盖，自动把上一条未作废记录 supersededBy 置为最新）
    recordStatusTransition(job.id, job.status, transition.next);
    return {
      ok: true,
      phase: transition.next,
      jobOpportunityId: job.id,
      status: transition.next,
      hint: transition.next === 'rejected'
        ? '该岗位已记录为已拒绝，可删除该岗位或匹配其他机会。'
        : transition.next === 'hired'
          ? '该岗位已记录为已入职，此岗位已完结。'
          : `该岗位已记录为${TARGET_LABELS[transition.next]}，可继续推进或记录结果。`,
    };
  },
});
