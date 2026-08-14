import { z } from 'zod';
import { deleteJobOpportunity, getJobOpportunity, updateJobTitle } from '@/src/db/repositories/job-opportunities';
import { getLatestApplyActionDetails } from '@/src/db/repositories/actions';
import { getTailoredResume } from '@/src/db/repositories/tailored-resumes';

// 契约性防御：strictObject 拒绝 company 等多余字段，落实「只改岗位名」约束（简历 PATCH 用 z.object，多余字段剥离无害）
const patchSchema = z.strictObject({ title: z.string().min(1).max(100) });

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
  let interviewPrep = null;
  if (record.interviewPrepJson) {
    try { interviewPrep = JSON.parse(record.interviewPrepJson); } catch { interviewPrep = null; }
  }
  // 投递-版本关联（refine-06）：最近一次成功投递所用专属简历版本；存量无记录 → null
  let appliedTailoredResume = null;
  const applyDetails = getLatestApplyActionDetails(id);
  if (applyDetails) {
    const tailored = getTailoredResume(applyDetails.tailoredResumeId);
    if (tailored) appliedTailoredResume = { id: tailored.id, version: tailored.version, createdAt: tailored.createdAt };
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
    interviewPrep,
    appliedTailoredResume,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getJobOpportunity(id)) return Response.json({ code: 'JOB_OPPORTUNITY_NOT_FOUND', message: '岗位不存在' }, { status: 404 });
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const unrecognized = parsed.error.issues.some((i) => i.code === 'unrecognized_keys');
    return Response.json(
      { code: 'INVALID_REQUEST', message: unrecognized ? '只允许修改岗位名' : '岗位名不能为空' },
      { status: 400 },
    );
  }
  updateJobTitle(id, parsed.data.title);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getJobOpportunity(id)) return Response.json({ code: 'JOB_OPPORTUNITY_NOT_FOUND', message: '岗位不存在' }, { status: 404 });
  deleteJobOpportunity(id);
  return Response.json({ ok: true });
}
