import { listResumes } from '@/src/db/repositories/resumes';

export async function GET() {
  const records = listResumes();
  return Response.json(records.map((r) => ({
    id: r.id,
    name: r.name,
    sourceType: r.sourceType,
    analyzed: r.analysisJson !== null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  })));
}
