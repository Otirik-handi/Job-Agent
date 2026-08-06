import { z } from 'zod';

/** tailoredResume 输入：无 confirmedEdits → 建议阶段；提供 confirmedEdits → 生成阶段 */
export const tailoredResumeInputSchema = z.object({
  jobOpportunityId: z.string().min(1).describe('岗位 ID（须已匹配）'),
  resumeId: z.string().optional().describe('目标简历 ID；缺省时系统自动取最近导入的简历'),
  confirmedEdits: z.array(z.object({
    id: z.string().regex(/^e\d+$/).describe('沿用建议清单中的编号'),
    sourceText: z.string().describe('简历原文片段（必须与原文逐字一致）'),
    suggestedText: z.string().describe('替换后的文本'),
  })).min(1).max(8).optional().describe('用户已确认（或逐条修改过）的替换清单；提供后进入生成阶段'),
});

/** 专属简历定点替换建议清单契约 v1（产物内嵌 schemaVersion） */
export const resumeEditSuggestionsSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  edits: z.array(z.object({
    id: z.string().regex(/^e\d+$/).describe('建议编号，稳定 id：e1、e2…'),
    section: z.enum(['summary', 'experience', 'skills', 'education', 'projects', 'other'])
      .describe('所属简历区块：summary 个人摘要 / experience 工作经历 / skills 技能 / education 教育 / projects 项目经历 / other 其他'),
    sourceText: z.string().describe('简历原文片段（必须逐字抄录，后续按此定位替换）'),
    suggestedText: z.string().describe('替换文本（针对岗位匹配结果优化后的表述）'),
    reason: z.string().describe('依据：引用匹配要求编号（r1..rn）或简历内已有证据'),
    factRisk: z.enum(['confirmed', 'inferred'])
      .describe('事实风险：confirmed 简历已有事实的重新表述 / inferred 推断性补充（用户需特别确认）'),
  })).min(1).max(8),
});

export type ResumeEditSuggestionsV1 = z.infer<typeof resumeEditSuggestionsSchemaV1>;
