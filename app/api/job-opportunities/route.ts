import { listJobOpportunities } from '@/src/db/repositories/job-opportunities';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? undefined;
  const records = listJobOpportunities(status);
  return Response.json(records.map((r) => ({
    id: r.id,
    company: r.company,
    title: r.title,
    status: r.status,
    matched: r.fitResultJson !== null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  })));
}
