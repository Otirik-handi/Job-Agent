import { deleteResume, getResume } from '@/src/db/repositories/resumes';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resume = getResume(id);
  if (!resume) return Response.json({ code: 'RESUME_NOT_FOUND', message: '简历不存在' }, { status: 404 });
  let analysis = null;
  if (resume.analysisJson) {
    try { analysis = JSON.parse(resume.analysisJson); } catch { analysis = null; }
  }
  return Response.json({
    id: resume.id,
    name: resume.name,
    sourceType: resume.sourceType,
    sourceText: resume.sourceText,
    analysis,
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getResume(id)) return Response.json({ code: 'RESUME_NOT_FOUND', message: '简历不存在' }, { status: 404 });
  deleteResume(id);
  return Response.json({ ok: true });
}
