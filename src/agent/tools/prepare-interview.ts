import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { getModel } from '../model';
import { getJobOpportunity, setInterviewPrep, getInterviewPrep } from '../../db/repositories/job-opportunities';
import { listResumes } from '../../db/repositories/resumes';
import { interviewPrepSchemaV1 } from '../schemas/interview-prep';
import { buildInterviewPrepSystemPrompt, buildInterviewPrepUserPrompt } from '../prompts/interview-prep';

const inputSchema = z.object({
  jobOpportunityId: z.string().min(1).describe('岗位 ID（须已匹配）'),
});

export const prepareInterviewTool = createDomainTool({
  name: 'prepareInterview',
  description: '面试准备：基于岗位匹配结果与已分析简历生成完整面试准备包（公司/岗位背景要点、自我介绍话术、预测面试问题含考察意图与 STAR 应答要点、向面试官提问清单）。参数 jobOpportunityId 为岗位 ID。前置条件：岗位须已完成匹配且系统中有已分析简历，否则失败——未匹配先调用 matchJob，未分析先导入并分析简历。返回 ok 与 summary 统计（问题数、是否有风险提示、提问数），完整准备包已保存至岗位详情，支持导出 Markdown。',
  inputSchema,
  progress: { start: '正在准备面试…', done: '面试准备完成' },
  execute: async (args, ctx) => {
    const job = getJobOpportunity(args.jobOpportunityId);
    if (!job) {
      return {
        ok: false,
        error: {
          code: 'JOB_NOT_FOUND',
          message: '岗位不存在，请先调用 importJobOpportunity 导入',
          hint: '系统中没有该岗位，请先调用 importJobOpportunity 导入岗位 JD 后，再重试面试准备。',
        },
      };
    }
    if (!job.fitResultJson) {
      return {
        ok: false,
        error: {
          code: 'JOB_MATCH_REQUIRED',
          message: '该岗位尚未完成匹配，无法准备面试',
          hint: '请先调用 matchJob 完成岗位匹配，再进行面试准备。',
        },
        jobOpportunityId: job.id,
      };
    }
    const resumes = listResumes();
    const analyzed = resumes.find((r) => r.analysisJson !== null);
    if (!analyzed || !analyzed.analysisJson) {
      return {
        ok: false,
        error: {
          code: 'RESUME_ANALYSIS_REQUIRED',
          message: '需要先导入并分析简历，才能准备面试',
          hint: '请先在对话中导入并分析简历，然后再进行面试准备。',
        },
        jobOpportunityId: job.id,
      };
    }

    const result = await ctx.callStructured({
      model: getModel(),
      systemPrompt: buildInterviewPrepSystemPrompt(),
      userPrompt: buildInterviewPrepUserPrompt(job.company, job.title, job.fitResultJson, analyzed.name, analyzed.sourceText),
      schema: interviewPrepSchemaV1,
      task: 'interview-prep',
    });

    if (!result.ok) {
      return {
        ok: false,
        error: { ...result.error, hint: '面试准备失败。可重试一次；若持续失败，检查模型配置或缩短简历文本。' },
        jobOpportunityId: job.id,
      };
    }

    const data = result.data;
    const hasExisting = getInterviewPrep(job.id) !== null;
    setInterviewPrep(job.id, JSON.stringify(data));

    return {
      ok: true,
      jobOpportunityId: job.id,
      summary: {
        questionsCount: data.questions.length,
        hasRisk: data.questions.some((q) => q.risk !== null),
        askThemCount: data.askThem.length,
      },
      hint: hasExisting
        ? '面试准备包已重新生成并覆盖旧版本，完整内容可在岗位详情中查看，支持导出 Markdown。'
        : '面试准备包已生成，完整内容可在岗位详情中查看，支持导出 Markdown。',
    };
  },
});
