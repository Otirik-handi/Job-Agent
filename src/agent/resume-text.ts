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

const SUPPORTED_EXTENSIONS = new Set(['.docx', '.txt', '.md']);

export function isSupportedFilePath(path: string): boolean {
  const lower = path.toLowerCase();
  return SUPPORTED_EXTENSIONS.has(lower.slice(lower.lastIndexOf('.')));
}

export function formatNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || '未命名简历';
}
