import { deleteJobOpportunity, getJobOpportunity } from '@/src/db/repositories/job-opportunities';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = getJobOpportunity(id);
  if (!record) return Response.json({ code: 'JOB_OPPORTUNITY_NOT_FOUND', message: '岗位不存在' }, { status: 404 });
  let fitResult = null;
  if (record.fitResultJson) {
    try { fitResult = JSON.parse(record.fitResultJson); } catch { fitResult = null; }
  }
  let channels = null;
  if (record.channelsJson) {
    try { channels = JSON.parse(record.channelsJson); } catch { channels = null; }
  }
  return Response.json({
    id: record.id,
    company: record.company,
    title: record.title,
    jdText: record.jdText,
    url: record.url,
    status: record.status,
    fitResult,
    channels,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getJobOpportunity(id)) return Response.json({ code: 'JOB_OPPORTUNITY_NOT_FOUND', message: '岗位不存在' }, { status: 404 });
  deleteJobOpportunity(id);
  return Response.json({ ok: true });
}
