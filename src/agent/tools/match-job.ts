import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { getModel } from '../model';
import { getJobOpportunity, updateJobMatch } from '../../db/repositories/job-opportunities';
import { listResumes, getResume } from '../../db/repositories/resumes';
import { jobMatchLLMOutputSchemaV2, jobMatchResultSchemaV2 } from '../schemas/job-match';
import { buildJobMatchSystemPrompt, buildJobMatchUserPrompt } from '../prompts/job-match';
import { detectJdRedFlags, fitBandFromScore } from '../jd-red-flags';
import { computeKeywordMatch } from '../keyword-match';

const inputSchema = z.strictObject({
  jobOpportunityId: z.string().min(1).describe('岗位 ID（由 importJobOpportunity 返回）'),
});

export const matchJobTool = createDomainTool({
  name: 'matchJob',
  description: '岗位匹配：将岗位 JD 与已分析的简历做三段式匹配（岗位理解 → 逐条匹配矩阵 → 投递建议），产出匹配评分与档位、JD 危险信号（red flag）检测、关键词匹配分（JD 关键词在简历中的命中率）与缺失关键词、风险点与必备修改。参数 jobOpportunityId 为岗位 ID（importJobOpportunity 返回）。前置条件：岗位须已导入，且系统中须已有导入并分析过的简历，否则失败——未导入先 importJobOpportunity，未分析先导入并分析简历；未提供岗位 ID 时先 listJobOpportunities。返回 ok、overallScore、fitBand、redFlagsCount、keywordMatchScore、missingKeywordsCount 与 summary 统计，完整匹配结果已保存，可在岗位详情查看。',
  inputSchema,
  progress: { start: '正在匹配岗位…', done: '岗位匹配完成' },
  execute: async (args, ctx) => {
    const job = getJobOpportunity(args.jobOpportunityId);
    if (!job) {
      return {
        ok: false,
        error: {
          code: 'JOB_NOT_FOUND',
          message: '岗位不存在，请先调用 importJobOpportunity 导入',
          hint: '系统中没有该岗位，请先调用 importJobOpportunity 导入岗位 JD 后，再重试匹配。',
        },
      };
    }

    const resumes = listResumes();
    const analyzed = resumes.find((r) => r.analysisJson !== null);
    if (!analyzed || !analyzed.analysisJson) {
      return {
        ok: false,
        error: {
          code: 'RESUME_ANALYSIS_REQUIRED',
          message: '需要先导入并分析简历，才能进行岗位匹配',
          hint: '请先在对话中导入并分析简历，然后再进行匹配。',
        },
        jobOpportunityId: job.id,
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
      schema: jobMatchLLMOutputSchemaV2,
      task: 'job-match',
    });

    if (!result.ok) {
      return {
        ok: false,
        error: { ...result.error, hint: '匹配失败。可重试一次；若持续失败，检查模型配置或缩短 JD 文本。' },
        jobOpportunityId: job.id,
      };
    }

    const data = result.data;
    const validIds = new Set(data.understanding.requirements.map((r) => r.id));
    for (const fit of data.fitResults) {
      if (!validIds.has(fit.requirementId)) {
        return {
          ok: false,
          error: {
            code: 'JOB_MATCH_CONSISTENCY_FAILED',
            message: '匹配结果引用不存在的要求编号',
            hint: '匹配结果内部不一致，请重试一次。',
          },
          jobOpportunityId: job.id,
        };
      }
    }

    // 确定性字段由系统计算后合并（LLM 不可漂移）：匹配分档位 + JD 危险信号 + 关键词匹配分
    const keywordMatch = computeKeywordMatch(data.keywords, resume.sourceText);
    const full = {
      ...data,
      fitBand: fitBandFromScore(data.overallScore),
      redFlags: detectJdRedFlags(job.jdText),
      keywordMatchScore: keywordMatch.keywordMatchScore,
      keywordResults: keywordMatch.keywordResults,
      missingKeywords: keywordMatch.missingKeywords,
    };
    const parsed = jobMatchResultSchemaV2.safeParse(full);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'JOB_MATCH_CONSISTENCY_FAILED',
          message: '匹配结果合并校验失败',
          hint: '确定性字段合并后不满足契约，请重试一次。',
        },
        jobOpportunityId: job.id,
      };
    }

    updateJobMatch(job.id, {
      company: data.understanding.company,
      title: data.understanding.title,
      fitResultJson: JSON.stringify(parsed.data),
    });

    return {
      ok: true,
      jobOpportunityId: job.id,
      overallScore: data.overallScore,
      fitBand: parsed.data.fitBand,
      redFlagsCount: parsed.data.redFlags.length,
      keywordMatchScore: parsed.data.keywordMatchScore,
      missingKeywordsCount: parsed.data.missingKeywords.length,
      summary: {
        requirementsCount: data.understanding.requirements.length,
        risksCount: data.risks.length,
        mustFixCount: data.advice.mustFix.length,
      },
      hint: '完整匹配结果已保存，可直接在界面中查看岗位详情。',
    };
  },
});
