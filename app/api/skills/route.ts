import { listSkillMetadata } from '@/src/agent/skills';

/** GET /api/skills：技能库元数据列表投影（只回传 name/description，正文按需走详情端点） */
export function GET() {
  return Response.json({ skills: listSkillMetadata() });
}
