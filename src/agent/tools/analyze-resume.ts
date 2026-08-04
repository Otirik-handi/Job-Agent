import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { getModel } from '../model';
import { getResume, updateResumeAnalysis } from '../../db/repositories/resumes';
import { resumeAnalysisSchemaV1 } from '../schemas/resume-analysis';
import { buildResumeAnalysisSystemPrompt, buildResumeAnalysisUserPrompt } from '../prompts/resume-analysis';

const inputSchema = z.object({
  resumeId: z.string().min(1).describe('要分析的简历 ID（由 importResume 返回）'),
});

export const analyzeResumeTool = createDomainTool({
  name: 'analyzeResume',
  description: '分析已导入的简历：产出结构化画像（技能/目标/年限）、评分、优势、风险与改进建议。输入 resumeId。',
  inputSchema,
  progress: { start: '正在分析简历…', done: '简历分析完成' },
  execute: async (args, ctx) => {
    const resume = getResume(args.resumeId);
    if (!resume) {
      throw new Error('简历不存在，请先调用 importResume 导入');
    }
    if (!resume.sourceText.trim()) {
      throw new Error('简历内容为空，无法分析');
    }

    const result = await ctx.callStructured({
      model: getModel(),
      systemPrompt: buildResumeAnalysisSystemPrompt(),
      userPrompt: buildResumeAnalysisUserPrompt(resume.name, resume.sourceText),
      schema: resumeAnalysisSchemaV1,
      task: 'resume-analysis',
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        resumeId: resume.id,
        hint: '分析失败。可重试一次；若持续失败，可尝试导入文本更短的简历或检查模型配置。',
      };
    }

    updateResumeAnalysis(resume.id, JSON.stringify(result.data));

    return {
      ok: true,
      resumeId: resume.id,
      overallScore: result.data.overallScore,
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
