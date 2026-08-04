import { describe, expect, it } from 'vitest';
import { normalizeResumeText, assertTextLength, isSupportedFilePath, MAX_RESUME_TEXT_LENGTH } from './resume-text';

describe('resume-text', () => {
  it('归一化换行', () => {
    expect(normalizeResumeText('a\r\nb\rc')).toBe('a\nb\nc');
  });
  it('超过上限抛错', () => {
    expect(() => assertTextLength('x'.repeat(MAX_RESUME_TEXT_LENGTH + 1))).toThrow();
  });
  it('支持与拒绝的扩展名', () => {
    expect(isSupportedFilePath('C:/a/b/resume.docx')).toBe(true);
    expect(isSupportedFilePath('resume.pdf')).toBe(false);
    expect(isSupportedFilePath('resume')).toBe(false);
  });
});
