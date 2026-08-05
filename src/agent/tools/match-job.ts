import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { getModel } from '../model';
import { getJobOpportunity, updateJobMatch } from '../../db/repositories/job-opportunities';
import { listResumes, getResume } from '../../db/repositories/resumes';
import { jobMatchResultSchemaV1 } from '../schemas/job-match';
import { buildJobMatchSystemPrompt, buildJobMatchUserPrompt } from '../prompts/job-match';

const inputSchema = z.object({
  jobOpportunityId: z.string().min(1).describe('岗位 ID（由 importJobOpportunity 返回）'),
});

export const matchJobTool = createDomainTool({
  name: 'matchJob',
  description: '岗位匹配：将岗位 JD 与已分析的简历做三段式匹配（岗位理解 → 逐条匹配矩阵 → 投递建议）。输入 jobOpportunityId。',
  inputSchema,
  progress: { start: '正在匹配岗位…', done: '岗位匹配完成' },
  execute: async (args, ctx) => {
    const job = getJobOpportunity(args.jobOpportunityId);
    if (!job) {
      throw new Error('岗位不存在，请先调用 importJobOpportunity 导入');
    }

    const resumes = listResumes();
    const analyzed = resumes.find((r) => r.analysisJson !== null);
    if (!analyzed || !analyzed.analysisJson) {
      return {
        ok: false,
        error: { code: 'RESUME_ANALYSIS_REQUIRED', message: '需要先导入并分析简历，才能进行岗位匹配' },
        jobOpportunityId: job.id,
        hint: '请先在对话中粘贴简历并分析，然后再进行匹配。',
      };
    }
    const resume = getResume(analyzed.id)!;
    let profileJson = '{}';
    try {
      const parsed = JSON.parse(resume.analysisJson!) as { profile?: unknown };
      profileJson = JSON.stringify(parsed.profile ?? {});
    } catch { profileJson = '{}'; }

    const result = await ctx.callStructured({
      model: getModel(),
      systemPrompt: buildJobMatchSystemPrompt(),
      userPrompt: buildJobMatchUserPrompt(job.jdText, resume.name, resume.sourceText, profileJson),
      schema: jobMatchResultSchemaV1,
      task: 'job-match',
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        jobOpportunityId: job.id,
        hint: '匹配失败。可重试一次；若持续失败，检查模型配置或缩短 JD 文本。',
      };
    }

    const data = result.data;
    const validIds = new Set(data.understanding.requirements.map((r) => r.id));
    for (const fit of data.fitResults) {
      if (!validIds.has(fit.requirementId)) {
        return { ok: false, error: { code: 'JOB_MATCH_CONSISTENCY_FAILED', message: '匹配结果引用不存在的要求编号' }, jobOpportunityId: job.id, hint: '匹配结果内部不一致，请重试。' };
      }
    }

    updateJobMatch(job.id, {
      company: data.understanding.company,
      title: data.understanding.title,
      fitResultJson: JSON.stringify(data),
    });

    return {
      ok: true,
      jobOpportunityId: job.id,
      overallScore: data.overallScore,
      summary: {
        requirementsCount: data.understanding.requirements.length,
        risksCount: data.risks.length,
        mustFixCount: data.advice.mustFix.length,
      },
      hint: '完整匹配结果已保存，可直接在界面中查看岗位详情。',
    };
  },
});
