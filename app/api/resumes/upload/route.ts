import {
  assertTextLength, buildResumeName, extractTextFromBuffer,
  isSupportedFilePath, ResumeTextError,
} from '@/src/agent/resume-text';
import { createResume, listResumes } from '@/src/db/repositories/resumes';

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return json({ code: 'INVALID_REQUEST', message: '请求格式无效' }, 400);
  const file = form.get('file');
  if (!(file instanceof File)) return json({ code: 'INVALID_FILE', message: '未收到文件字段 file' }, 400);
  if (file.size === 0) return json({ code: 'INVALID_FILE', message: '文件为空' }, 400);
  if (file.size > MAX_UPLOAD_SIZE) return json({ code: 'FILE_TOO_LARGE', message: `文件超过 ${MAX_UPLOAD_SIZE / (1024 * 1024)}MB 上限` }, 400);
  if (!isSupportedFilePath(file.name)) {
    return json({ code: 'UNSUPPORTED_FORMAT', message: '不支持的文件格式：仅支持 PDF / DOCX / TXT / MD' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sourceType = file.name.toLowerCase().slice(file.name.lastIndexOf('.') + 1);

  let sourceText: string;
  try {
    sourceText = await extractTextFromBuffer(buffer, file.name);
    assertTextLength(sourceText);
  } catch (err) {
    if (err instanceof ResumeTextError) {
      return json({ code: 'PARSE_FAILED', message: err.message }, 422);
    }
    console.error(`简历文件解析异常（${sourceType}）:`, (err as Error).message); // 只记格式与原因，不记内容
    return json({ code: 'PARSE_FAILED', message: '文件解析失败，请确认文件未损坏' }, 422);
  }

  const existingNames = listResumes().map((r) => r.name);
  const record = createResume({
    name: buildResumeName(file.name, existingNames),
    sourceType,
    sourceText,
  });

  return json({
    id: record.id, name: record.name, sourceType: record.sourceType,
    charCount: sourceText.length, preview: sourceText.slice(0, 120),
  });
}
