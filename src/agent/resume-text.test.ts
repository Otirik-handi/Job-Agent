import { describe, expect, it } from 'vitest';
import {
  normalizeResumeText, assertTextLength, isSupportedFilePath,
  MAX_RESUME_TEXT_LENGTH, formatNameFromFile, buildResumeName,
} from './resume-text';

describe('resume-text', () => {
  it('归一化换行', () => {
    expect(normalizeResumeText('a\r\nb\rc')).toBe('a\nb\nc');
  });
  it('超过上限抛错', () => {
    expect(() => assertTextLength('x'.repeat(MAX_RESUME_TEXT_LENGTH + 1))).toThrow();
  });
  it('支持与拒绝的扩展名', () => {
    expect(isSupportedFilePath('C:/a/b/resume.docx')).toBe(true);
    expect(isSupportedFilePath('resume.pdf')).toBe(true);   // 本次新增 PDF 支持
    expect(isSupportedFilePath('resume.txt')).toBe(true);
    expect(isSupportedFilePath('resume.md')).toBe(true);
    expect(isSupportedFilePath('resume.doc')).toBe(false);  // 旧版 .doc 不支持
    expect(isSupportedFilePath('resume.png')).toBe(false);  // 图片不支持
    expect(isSupportedFilePath('resume')).toBe(false);
  });
  it('文件名去扩展名', () => {
    expect(formatNameFromFile('张三.pdf')).toBe('张三');
    expect(formatNameFromFile('C:/a/b/张三 2024.docx')).toBe('张三 2024');
    expect(formatNameFromFile('noext')).toBe('noext');
    expect(formatNameFromFile('')).toBe('');
  });
  it('重名追加本地时间戳后缀', () => {
    expect(buildResumeName('张三.pdf', ['李四'])).toBe('张三');
    expect(buildResumeName('张三.pdf', ['张三'])).toMatch(/^张三-\d{8}-\d{4}$/);
    expect(buildResumeName('张三.pdf', ['张三', `张三-20260805-1530`])).toMatch(/^张三-\d{8}-\d{4}$/);
  });
});
