import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { readSkillContent } from '../skills';

const inputSchema = z.strictObject({
  skillName: z
    .string()
    .min(1)
    .describe('skill 名（小写连字符，如 resume-analysis）；可选值见系统提示的 Skill 元数据段'),
});

/** 确定性只读工具（无 LLM 调用，免确认）：按需加载技能库中指定 skill 的完整正文（SKILL.md）。 */
export const readSkillTool = createDomainTool({
  name: 'readSkill',
  description: '读取技能库中指定 skill 的完整正文（SKILL.md，含 frontmatter 与正文规则）。当任务需要专业知识（评分卡、解析规则、题库、模板等）且对应 skill 正文尚未在上下文中时调用；skill 正文已在上下文中、或任务不需要专业技能时不要调用。参数 skillName 为 skill 名（小写连字符），可选值见系统提示的 Skill 元数据段。返回 ok、name、description 与 content 全文（含 frontmatter），加载后需遵循其中规则执行；未知 skill 返回结构化错误 SKILL_NOT_FOUND。',
  inputSchema,
  progress: { start: '正在读取技能…', done: '技能读取完成' },
  execute: async (args) => {
    const skill = readSkillContent(args.skillName);
    if (!skill) {
      return {
        ok: false,
        error: {
          code: 'SKILL_NOT_FOUND',
          message: `未找到技能「${args.skillName}」，技能库中不存在该 skill。`,
          hint: '可用 skill 列表见 system prompt 的 Skill 元数据段或先调用 listSkill 类工具；确认 skill 名（小写连字符）后重试。',
        },
      };
    }
    return { ok: true, name: skill.name, description: skill.description, content: skill.content };
  },
});
