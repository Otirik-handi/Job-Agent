import { listTailoredResumes } from '@/src/db/repositories/tailored-resumes';
import { getJobOpportunity } from '@/src/db/repositories/job-opportunities';
import { getResume } from '@/src/db/repositories/resumes';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobOpportunityId = url.searchParams.get('jobOpportunityId') ?? undefined;
  const resumeId = url.searchParams.get('resumeId') ?? undefined;

  const records = listTailoredResumes({ resumeId, jobOpportunityId });
  return Response.json(records.map((r) => {
    const job = getJobOpportunity(r.jobOpportunityId);
    const resume = getResume(r.resumeId);
    return {
      id: r.id,
      resumeId: r.resumeId,
      jobOpportunityId: r.jobOpportunityId,
      version: r.version,
      jobCompany: job?.company ?? '',
      jobTitle: job?.title ?? '',
      resumeName: resume?.name ?? '',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }));
}
