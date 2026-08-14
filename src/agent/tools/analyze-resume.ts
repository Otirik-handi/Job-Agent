import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { getModel } from '../model';
import { getResume, updateResumeAnalysis } from '../../db/repositories/resumes';
import { resumeAnalysisLLMOutputSchemaV2, resumeAnalysisSchemaV2 } from '../schemas/resume-analysis';
import { buildResumeAnalysisSystemPrompt, buildResumeAnalysisUserPrompt } from '../prompts/resume-analysis';
import { runAtsChecks } from '../ats-checks';

const inputSchema = z.strictObject({
  resumeId: z.string().min(1).describe('要分析的简历 ID（由 importResume 返回）'),
});

export const analyzeResumeTool = createDomainTool({
  name: 'analyzeResume',
  description: '分析已导入的简历：产出结构化画像（技能、目标岗位、工作年限）、整体评分 0-100、优势、风险、改进建议与 ATS 兼容性检查清单（区块头/日期/联系方式/关键词密度等确定性检查）。参数 resumeId 为简历 ID（importResume 返回），未提供时先调用 listResumes 获取。前置条件：简历须已导入，否则返回错误——先调用 importResume。返回 ok、overallScore、atsIssuesCount 与 summary 统计（优势/风险/改进条数、待确认项数），完整分析已保存，可在简历详情查看。',
  inputSchema,
  progress: { start: '正在分析简历…', done: '简历分析完成' },
  execute: async (args, ctx) => {
    const resume = getResume(args.resumeId);
    if (!resume) {
      return {
        ok: false,
        error: {
          code: 'RESUME_NOT_FOUND',
          message: '简历不存在，请先调用 importResume 导入',
          hint: '系统中没有该简历，请先调用 importResume 导入简历后，再重试分析。',
        },
      };
    }
    if (!resume.sourceText.trim()) {
      return {
        ok: false,
        error: {
          code: 'RESUME_CONTENT_EMPTY',
          message: '简历内容为空，无法分析',
          hint: '该简历没有可分析的文本内容，请导入包含正文内容的简历后重试。',
        },
      };
    }

    const result = await ctx.callStructured({
      model: getModel(),
      systemPrompt: buildResumeAnalysisSystemPrompt(),
      userPrompt: buildResumeAnalysisUserPrompt(resume.name, resume.sourceText),
      schema: resumeAnalysisLLMOutputSchemaV2,
      task: 'resume-analysis',
    });

    if (!result.ok) {
      return {
        ok: false,
        error: { ...result.error, hint: '分析失败。可重试一次；若持续失败，可尝试导入文本更短的简历或检查模型配置。' },
        resumeId: resume.id,
      };
    }

    // 确定性字段由系统计算后合并：ATS 兼容性检查（纯文本可检测子集）
    const full = {
      ...result.data,
      atsChecks: runAtsChecks(resume.sourceText),
    };
    const parsed = resumeAnalysisSchemaV2.safeParse(full);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'RESUME_ANALYSIS_CONSISTENCY_FAILED',
          message: '分析结果合并校验失败',
          hint: 'ATS 检查合并后不满足契约，请重试一次。',
        },
        resumeId: resume.id,
      };
    }

    updateResumeAnalysis(resume.id, JSON.stringify(parsed.data));

    return {
      ok: true,
      resumeId: resume.id,
      overallScore: result.data.overallScore,
      atsIssuesCount: parsed.data.atsChecks.filter((c) => !c.ok).length,
      summary: {
        strengthsCount: result.data.strengths.length,
        risksCount: result.data.risks.length,
        improvementsCount: result.data.improvements.length,
        pendingConfirmations: result.data.pendingConfirmations,
      },
      hint: '完整分析结果已保存，可直接在界面中查看简历详情。',
    };
  },
});
