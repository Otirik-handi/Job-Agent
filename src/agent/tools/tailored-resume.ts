import { createDomainTool } from '../tool-factory';
import { getModel } from '../model';
import { getJobOpportunity } from '../../db/repositories/job-opportunities';
import { getResume, listResumes } from '../../db/repositories/resumes';
import { createTailoredResume } from '../../db/repositories/tailored-resumes';
import { resumeEditSuggestionsSchemaV1, tailoredResumeInputSchema } from '../schemas/tailored-resume';
import { buildTailoredResumeSystemPrompt, buildTailoredResumeSuggestionsUserPrompt } from '../prompts/tailored-resume';
import { applyEdits, validateEdits } from '../resume-edits';

export const tailoredResumeTool = createDomainTool({
  name: 'tailoredResume',
  description: '专属简历：针对岗位匹配结果为简历生成定点替换建议，经用户逐条确认后产出专属简历版本，两段式调用。参数：jobOpportunityId（须已匹配，未匹配返回 JOB_MATCH_REQUIRED——先调用 matchJob）、resumeId（可选，缺省自动取最近导入的简历）、confirmedEdits（用户确认后的替换清单：沿用建议编号 id、原文片段 sourceText 须逐字一致、替换文本 suggestedText）。第一段不带 confirmedEdits：仅生成替换建议清单（含 factRisk 标注：confirmed 事实重述 / inferred 推断补充），不落库，须在对话中逐条向用户呈现并请求确认。用户确认后第二段携带 confirmedEdits 再次调用：应用替换生成专属简历版本并落库，返回 ok、tailoredResumeId 与 version。',
  inputSchema: tailoredResumeInputSchema,
  progress: { start: '正在生成专属简历…', done: '专属简历生成完成' },
  execute: async (args, ctx) => {
    const job = getJobOpportunity(args.jobOpportunityId);
    if (!job) {
      return {
        ok: false,
        error: {
          code: 'JOB_NOT_FOUND',
          message: '岗位不存在，请先调用 importJobOpportunity 导入',
          hint: '系统中没有该岗位，请先调用 importJobOpportunity 导入岗位 JD 后，再重试生成专属简历。',
        },
      };
    }
    if (!job.fitResultJson) {
      return {
        ok: false,
        error: {
          code: 'JOB_MATCH_REQUIRED',
          message: '该岗位尚未完成匹配，无法生成专属简历',
          hint: '请先调用 matchJob 完成岗位匹配，再生成专属简历。',
        },
        jobOpportunityId: job.id,
      };
    }

    const resume = args.resumeId
      ? getResume(args.resumeId)
      : listResumes()[0] ?? null;
    if (!resume) {
      return {
        ok: false,
        error: {
          code: 'RESUME_NOT_FOUND',
          message: '系统中没有简历，无法生成专属简历',
          hint: '请先导入并分析简历，再生成专属简历。',
        },
        jobOpportunityId: job.id,
      };
    }

    // —— 第一段：出定点替换建议清单（不落库） ——
    if (!args.confirmedEdits) {
      const result = await ctx.callStructured({
        model: getModel(),
        systemPrompt: buildTailoredResumeSystemPrompt(),
        userPrompt: buildTailoredResumeSuggestionsUserPrompt(resume.name, resume.sourceText, job.fitResultJson),
        schema: resumeEditSuggestionsSchemaV1,
        task: 'tailored-resume-suggestions',
      });
      if (!result.ok) {
        return {
          ok: false,
          error: { ...result.error, hint: '生成建议失败。可重试一次；若持续失败，检查模型配置。' },
          jobOpportunityId: job.id,
          resumeId: resume.id,
        };
      }

      // 本地校验：sourceText 必须唯一匹配简历原文，无效建议剔除
      const { valid, invalid } = validateEdits(resume.sourceText, result.data.edits);
      if (valid.length === 0) {
        return {
          ok: false,
          error: {
            code: 'EDIT_SOURCE_NOT_FOUND',
            message: `全部 ${result.data.edits.length} 条建议均无法唯一匹配简历原文（${invalid[0]?.code ?? ''}）`,
            hint: '建议清单的原文片段定位失败，请重新生成建议（提醒模型必须逐字抄录简历原文片段）。',
          },
          jobOpportunityId: job.id,
          resumeId: resume.id,
        };
      }

      return {
        ok: true,
        phase: 'suggestions',
        jobOpportunityId: job.id,
        resumeId: resume.id,
        droppedCount: invalid.length,
        edits: valid.map((e) => ({
          id: e.id,
          section: result.data.edits.find((o) => o.id === e.id)?.section ?? 'other',
          sourceText: e.sourceText,
          suggestedText: e.suggestedText,
          reason: result.data.edits.find((o) => o.id === e.id)?.reason ?? '',
          factRisk: result.data.edits.find((o) => o.id === e.id)?.factRisk ?? 'confirmed',
        })),
        hint: '请将建议清单逐条向用户呈现（标注 factRisk：confirmed 为事实重述、inferred 为推断补充），请求用户逐条确认或修改；用户确认后，携带 confirmedEdits 再次调用本工具生成专属简历。',
      };
    }

    // —— 第二段：应用确认后的替换，生成专属简历版本并落库 ——
    const applied = applyEdits(resume.sourceText, args.confirmedEdits);
    if (!applied.ok) {
      return {
        ok: false,
        error: {
          code: applied.code,
          message: `有 ${applied.failedEdits.length} 条替换片段无法唯一匹配简历原文`,
          hint: '部分确认的替换片段无法在简历原文中唯一匹配，请向用户展示失败条目，请其修正原文片段后重试。',
        },
        jobOpportunityId: job.id,
        resumeId: resume.id,
        failedEdits: applied.failedEdits.map((e) => ({ id: e.id, sourceText: e.sourceText })),
      };
    }

    const record = createTailoredResume({
      resumeId: resume.id,
      jobOpportunityId: job.id,
      contentMarkdown: applied.markdown,
    });

    return {
      ok: true,
      phase: 'generated',
      jobOpportunityId: job.id,
      resumeId: resume.id,
      tailoredResumeId: record.id,
      version: record.version,
      appliedCount: applied.appliedCount,
      hint: `专属简历 v${record.version} 已生成并保存，可在界面"专属简历"中查看；如需调整可提出修改意见再次生成新版本。`,
    };
  },
});
