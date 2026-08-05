import { readFile } from 'node:fs/promises';

export const MAX_RESUME_TEXT_LENGTH = 80_000;

export class ResumeTextError extends Error {}

export function normalizeResumeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

export function assertTextLength(text: string): void {
  if (text.length > MAX_RESUME_TEXT_LENGTH) {
    throw new ResumeTextError(`简历文本超过 ${MAX_RESUME_TEXT_LENGTH} 字符上限`);
  }
}

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);

export function isSupportedFilePath(path: string): boolean {
  const lower = path.toLowerCase();
  return SUPPORTED_EXTENSIONS.has(lower.slice(lower.lastIndexOf('.')));
}

export function formatNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || '未命名简历';
}

/** 文件名去扩展名（保留目录中文件名部分） */
export function formatNameFromFile(fileName: string): string {
  const base = fileName.replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** 重名时追加本地时间戳后缀：张三 → 张三-20260805-1530 */
export function buildResumeName(fileName: string, existingNames: string[]): string {
  const base = formatNameFromFile(fileName) || '未命名简历';
  if (!existingNames.includes(base)) return base;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${base}-${ts}`;
}

function assertHasText(text: string): string {
  const normalized = normalizeResumeText(text);
  if (!normalized) {
    throw new ResumeTextError('该 PDF 未提取到文字（可能是扫描件或图片），请改用 DOCX / TXT 或粘贴文本');
  }
  return normalized;
}

async function extractPdf(source: { path: string } | { buffer: Buffer }): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const data = 'buffer' in source ? source.buffer : await readFile(source.path);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return assertHasText(result.text ?? '');
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(source: { path: string } | { buffer: Buffer }): Promise<string> {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText(source);
  return assertHasText(result.value);
}

function extractPlainText(buffer: Buffer): string {
  return assertHasText(buffer.toString('utf-8'));
}

/** 从本地文件路径提取文本（importResume.filePath 用） */
export async function extractTextFromFile(filePath: string): Promise<string> {
  if (!isSupportedFilePath(filePath)) {
    throw new ResumeTextError('不支持的格式：仅支持 .pdf / .docx / .txt / .md（不支持图片、扫描件、旧版 .doc）');
  }
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.pdf')) return extractPdf({ path: filePath });
  if (lower.endsWith('.docx')) return extractDocx({ path: filePath });
  return assertHasText(await readFile(filePath, 'utf-8'));
}

/** 从内存 Buffer 提取文本（文件上传用） */
export async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
  if (!isSupportedFilePath(fileName)) {
    throw new ResumeTextError('不支持的格式：仅支持 .pdf / .docx / .txt / .md（不支持图片、扫描件、旧版 .doc）');
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return extractPdf({ buffer });
  if (lower.endsWith('.docx')) return extractDocx({ buffer });
  return extractPlainText(buffer);
}
