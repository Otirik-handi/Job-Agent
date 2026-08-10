import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { createResume } from '../../db/repositories/resumes';
import {
  assertTextLength, extractTextFromFile, formatNameFromPath,
  normalizeResumeText,
} from '../resume-text';

const inputSchema = z.object({
  text: z.string().min(1).optional().describe('简历文本内容（粘贴方式）'),
  filePath: z.string().min(1).optional().describe('本地简历文件路径，支持 .pdf/.docx/.txt/.md'),
});

export const importResumeTool = createDomainTool({
  name: 'importResume',
  description: '导入简历：将用户粘贴的简历文本或本地简历文件保存到系统。参数二选一：text 为粘贴的简历文本，filePath 为本地 .pdf/.docx/.txt/.md 文件路径，且必须且只能提供其一。仅当用户提供新简历内容时调用；简历已在系统中时应先调用 listResumes 获取 resumeId 复用，不要重复导入。返回 resumeId、名称、来源与文本预览，导入后可用 analyzeResume 分析。',
  inputSchema,
  progress: { start: '正在读取简历…', done: '简历导入完成' },
  execute: async (args) => {
    const hasText = typeof args.text === 'string' && args.text.length > 0;
    const hasPath = typeof args.filePath === 'string' && args.filePath.length > 0;
    if (hasText === hasPath) {
      throw new Error('请提供且仅提供一种简历来源：text（粘贴）或 filePath（本地文件路径）');
    }

    const raw = hasText ? args.text! : await extractTextFromFile(args.filePath!);
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
