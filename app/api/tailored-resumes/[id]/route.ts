import { deleteTailoredResume, getTailoredResume } from '@/src/db/repositories/tailored-resumes';
import { getJobOpportunity } from '@/src/db/repositories/job-opportunities';
import { getResume } from '@/src/db/repositories/resumes';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = getTailoredResume(id);
  if (!record) return Response.json({ code: 'TAILORED_RESUME_NOT_FOUND', message: '专属简历不存在' }, { status: 404 });
  const job = getJobOpportunity(record.jobOpportunityId);
  const resume = getResume(record.resumeId);
  return Response.json({
    id: record.id,
    resumeId: record.resumeId,
    jobOpportunityId: record.jobOpportunityId,
    version: record.version,
    contentMarkdown: record.contentMarkdown,
    jobCompany: job?.company ?? '',
    jobTitle: job?.title ?? '',
    resumeName: resume?.name ?? '',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getTailoredResume(id)) return Response.json({ code: 'TAILORED_RESUME_NOT_FOUND', message: '专属简历不存在' }, { status: 404 });
  deleteTailoredResume(id);
  return Response.json({ ok: true });
}
