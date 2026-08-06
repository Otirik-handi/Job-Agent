import { createDomainTool } from '../tool-factory';
import { getJobOpportunity, updateJobApplication } from '../../db/repositories/job-opportunities';
import { applyJobInputSchema } from '../schemas/apply-job';
import { applyStateTransition } from '../apply-state';

type Channel = {
  id: string; type: string; label: string; url: string | null; email: string | null;
  verification: string; riskSignals: string[];
};

/** 宽容解析 channels_json（对齐前端 use-job-detail 模式）；解析失败返回 null */
function parseChannels(json: string | null): { channels: Channel[] } | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && Array.isArray(parsed.channels) ? parsed : null;
  } catch {
    return null;
  }
}

export const applyJobTool = createDomainTool({
  name: 'applyJob',
  description: '投递管理：将岗位投递状态向前推进（matched→applying→applied）或标记跳过（→skipped）。两段式：先不带 confirmed 调用获取投递摘要（当前/目标状态、推荐渠道）并向用户确认；用户确认后带 confirmed=true 再次调用落库。',
  inputSchema: applyJobInputSchema,
  progress: { start: '正在更新投递状态…', done: '投递状态已更新' },
  execute: async (args) => {
    const job = getJobOpportunity(args.jobOpportunityId);
    if (!job) {
      throw new Error('岗位不存在，请先调用 importJobOpportunity 导入');
    }
    if (args.action === 'apply' && !job.fitResultJson) {
      return {
        ok: false,
        error: { code: 'JOB_MATCH_REQUIRED', message: '该岗位尚未完成匹配，无法投递' },
        jobOpportunityId: job.id,
        hint: '请先调用 matchJob 完成岗位匹配，再执行投递。',
      };
    }

    const transition = applyStateTransition(job.status, args.action);
    if (!transition.ok) {
      return {
        ok: false,
        error: { code: transition.code, message: transition.code === 'JOB_MATCH_REQUIRED' ? '该岗位尚未完成匹配，无法投递' : `当前状态 ${job.status} 不能执行 ${args.action}` },
        jobOpportunityId: job.id,
        currentStatus: job.status,
        hint: transition.code === 'JOB_MATCH_REQUIRED'
          ? '请先调用 matchJob 完成岗位匹配，再执行投递。'
          : args.action === 'apply'
            ? '岗位已处于终态（已投递/已跳过），无需重复投递。'
            : '岗位已投递，不能标记为跳过。',
      };
    }

    // —— 第一段：出投递摘要（不落库）——
    if (!args.confirmed) {
      const channels = parseChannels(job.channelsJson);
      return {
        ok: true,
        phase: 'preview',
        jobOpportunityId: job.id,
        currentStatus: job.status,
        targetStatus: transition.next,
        channels: (channels?.channels ?? []).map((c) => ({
          id: c.id, type: c.type, label: c.label, url: c.url, email: c.email,
          verification: c.verification, riskSignals: c.riskSignals,
        })),
        hint: `请向用户呈现投递摘要：将把岗位从 ${job.status} 推进到 ${transition.next}` +
          (channels && channels.channels.length > 0
            ? '，推荐渠道如下（优先已核验渠道），并请求确认。'
            : '（未发现渠道，可直接确认投递）。') +
          '用户确认后，携带 confirmed=true 再次调用本工具。',
      };
    }

    // —— 第二段：状态推进落库 ——
    updateJobApplication(job.id, transition.next as 'applying' | 'applied' | 'skipped');
    return {
      ok: true,
      phase: transition.next,
      jobOpportunityId: job.id,
      status: transition.next,
      hint: transition.next === 'skipped'
        ? '该岗位已标记为跳过，可继续处理其他岗位。'
        : `该岗位已标记为${transition.next === 'applying' ? '投递中' : '已投递'}，可继续为其他岗位执行投递。`,
    };
  },
});
