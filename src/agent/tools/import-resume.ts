import { readFile } from 'node:fs/promises';
import mammoth from 'mammoth';
import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { createResume } from '../../db/repositories/resumes';
import { assertTextLength, formatNameFromPath, isSupportedFilePath, normalizeResumeText, ResumeTextError } from '../resume-text';

const inputSchema = z.object({
  text: z.string().min(1).optional().describe('简历文本内容（粘贴方式）'),
  filePath: z.string().min(1).optional().describe('本地简历文件路径，支持 .docx/.txt/.md'),
});

async function extractFromFile(filePath: string): Promise<string> {
  if (!isSupportedFilePath(filePath)) {
    throw new ResumeTextError('不支持的格式：仅支持 .docx / .txt / .md（不支持 PDF、图片、扫描件、旧版 .doc）');
  }
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  return readFile(filePath, 'utf-8');
}

export const importResumeTool = createDomainTool({
  name: 'importResume',
  description: '导入简历：接受粘贴的简历文本，或本地 .docx/.txt/.md 文件路径。导入后返回 resumeId，可用 analyzeResume 分析。',
  inputSchema,
  progress: { start: '正在读取简历…', done: '简历导入完成' },
  execute: async (args) => {
    const hasText = typeof args.text === 'string' && args.text.length > 0;
    const hasPath = typeof args.filePath === 'string' && args.filePath.length > 0;
    if (hasText === hasPath) {
      throw new Error('请提供且仅提供一种简历来源：text（粘贴）或 filePath（本地文件路径）');
    }

    const raw = hasText ? args.text! : await extractFromFile(args.filePath!);
    const sourceText = normalizeResumeText(raw);
    assertTextLength(sourceText);

    const record = createResume({
      name: hasPath ? formatNameFromPath(args.filePath!) : `粘贴简历 ${new Date().toISOString().slice(0, 10)}`,
      sourceType: hasPath ? args.filePath!.toLowerCase().slice(args.filePath!.lastIndexOf('.') + 1) : 'paste',
      sourceText,
    });

    return {
      resumeId: record.id,
      name: record.name,
      sourceType: record.sourceType,
      charCount: sourceText.length,
      preview: sourceText.slice(0, 120),
      next: '可以调用 analyzeResume 对这份简历进行分析',
    };
  },
});
