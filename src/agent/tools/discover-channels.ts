import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { getModel } from '../model';
import { getJobOpportunity, updateJobChannels } from '../../db/repositories/job-opportunities';
import { channelDiscoveryResultSchemaV1 } from '../schemas/channel-discovery';
import { buildChannelDiscoverySystemPrompt, buildChannelDiscoveryUserPrompt } from '../prompts/channel-discovery';
import { extractCandidates, isJobBoardDomain, verifyChannel } from '../channel-guard';

const inputSchema = z.object({
  jobOpportunityId: z.string().min(1).describe('岗位 ID（由 importJobOpportunity 返回）'),
});

export const discoverChannelsTool = createDomainTool({
  name: 'discoverChannels',
  description: '渠道发现：从岗位 JD 中提取投递渠道（官网/邮箱/招聘平台），经本地规则核验后保存。输入 jobOpportunityId。',
  inputSchema,
  progress: { start: '正在发现投递渠道…', done: '渠道发现完成' },
  execute: async (args, ctx) => {
    const job = getJobOpportunity(args.jobOpportunityId);
    if (!job) {
      throw new Error('岗位不存在，请先调用 importJobOpportunity 导入');
    }

    // 本地提取：URL/邮箱一律来自 JD 原文，LLM 只能引用
    const candidates = extractCandidates(job.jdText);

    const result = await ctx.callStructured({
      model: getModel(),
      systemPrompt: buildChannelDiscoverySystemPrompt(),
      userPrompt: buildChannelDiscoveryUserPrompt(job.company, job.title, job.jdText, candidates),
      schema: channelDiscoveryResultSchemaV1,
      task: 'channel-discovery',
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        jobOpportunityId: job.id,
        hint: '渠道发现失败。可重试一次；若持续失败，检查模型配置或缩短 JD 文本。',
      };
    }

    // 本地规则护栏（经验 #6）：后置覆写 LLM 结果
    const allowedUrls = candidates.urls;
    const allowedEmails = candidates.emails;
    const kept = result.data.channels.filter((c) => {
      // 无投递实体（url 与 email 均空）的渠道剔除
      if (!c.url && !c.email) return false;
      // 招聘平台/ATS 域名黑名单：强制分类为 job_board
      if (c.url && isJobBoardDomain(c.url)) c.type = 'job_board';
      // 引用集合外 / 格式非法的 url、email：强制标记需核验，严禁信任
      if (verifyChannel(c, allowedUrls, allowedEmails) === 'needs_check') c.verification = 'needs_check';
      return true;
    });

    const byType = {
      official: kept.filter((c) => c.type === 'official').length,
      jobBoard: kept.filter((c) => c.type === 'job_board').length,
      email: kept.filter((c) => c.type === 'email').length,
      unknown: kept.filter((c) => c.type === 'unknown').length,
    };
    const saved = { schemaVersion: 1 as const, channels: kept };
    updateJobChannels(job.id, JSON.stringify(saved));

    return {
      ok: true,
      jobOpportunityId: job.id,
      channelsCount: kept.length,
      byType,
      hint: kept.length > 0
        ? '渠道已保存，可在界面岗位详情中查看。'
        : 'JD 中未找到可核验的投递渠道（无有效链接或邮箱），可让用户补充投递信息。',
    };
  },
});
