import { readSkillContent } from '@/src/agent/skills';

/** GET /api/skills/[name]：技能详情（SKILL.md 全文含 frontmatter，前端渲染时剥离；
 * readSkillContent 三道闸防路径穿越，未命中统一 404） */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const skill = readSkillContent(name);
  if (!skill) return Response.json({ code: 'SKILL_NOT_FOUND', message: '技能不存在' }, { status: 404 });
  return Response.json(skill);
}
