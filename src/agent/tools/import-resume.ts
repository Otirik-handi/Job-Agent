import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { createResume } from '../../db/repositories/resumes';
import {
  assertTextLength, extractTextFromFile, formatNameFromPath,
  normalizeResumeText, ResumeTextError,
} from '../resume-text';

const inputSchema = z.strictObject({
  text: z.string().min(1).optional().describe('简历文本内容（粘贴方式）'),
  filePath: z.string().min(1).optional().describe('本地简历文件路径，支持 .pdf/.docx/.txt/.md'),
});

export const importResumeTool = createDomainTool({
  name: 'importResume',
  description: '导入简历：将用户粘贴的简历文本或本地简历文件保存到系统。参数二选一：text 为粘贴的简历文本，filePath 为本地 .pdf/.docx/.txt/.md 文件路径，且必须且只能提供其一（否则返回错误）。仅当用户提供新简历内容时调用；简历已在系统中时应先调用 listResumes 获取 resumeId 复用，不要重复导入。返回 ok、resumeId、名称、来源与文本预览，导入后可用 analyzeResume 分析。',
  inputSchema,
  progress: { start: '正在读取简历…', done: '简历导入完成' },
  execute: async (args) => {
    const hasText = typeof args.text === 'string' && args.text.length > 0;
    const hasPath = typeof args.filePath === 'string' && args.filePath.length > 0;
    if (hasText === hasPath) {
      return {
        ok: false,
        error: {
          code: 'RESUME_SOURCE_REQUIRED',
          message: '请提供且仅提供一种简历来源：text（粘贴）或 filePath（本地文件路径）',
          hint: 'text 与 filePath 只能提供其一：粘贴文本请传 text，本地文件请传 filePath。',
        },
      };
    }

    let raw: string;
    if (hasPath) {
      try {
        raw = await extractTextFromFile(args.filePath!);
      } catch (err) {
        if (err instanceof ResumeTextError) {
          const unsupported = err.message.includes('不支持的格式');
          return {
            ok: false,
            error: {
              code: unsupported ? 'UNSUPPORTED_FORMAT' : 'RESUME_TEXT_EMPTY',
              message: err.message,
              hint: unsupported
                ? '不支持该文件格式：请提供 .pdf / .docx / .txt / .md 文件，或改用粘贴文本方式导入。'
                : '未能从文件中提取到文字（可能是空文件或扫描件）：请改用可复制的文本文件或直接粘贴文本。',
            },
          };
        }
        if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
          return {
            ok: false,
            error: {
              code: 'FILE_NOT_FOUND',
              message: `文件不存在：${args.filePath}`,
              hint: '文件路径不存在：请确认路径正确后重试，或改用粘贴文本方式导入。',
            },
          };
        }
        throw err;
      }
    } else {
      raw = args.text!;
    }
    const sourceText = normalizeResumeText(raw);
    try {
      assertTextLength(sourceText);
    } catch (err) {
      if (err instanceof ResumeTextError) {
        return {
          ok: false,
          error: {
            code: 'TEXT_TOO_LONG',
            message: err.message,
            hint: '简历文本超过 80000 字符上限：请精简内容后重试。',
          },
        };
      }
      throw err;
    }

    const record = createResume({
      name: hasPath ? formatNameFromPath(args.filePath!) : `粘贴简历 ${new Date().toISOString().slice(0, 10)}`,
      sourceType: hasPath ? args.filePath!.toLowerCase().slice(args.filePath!.lastIndexOf('.') + 1) : 'paste',
      sourceText,
    });

    return {
      ok: true,
      resumeId: record.id,
      name: record.name,
      sourceType: record.sourceType,
      charCount: sourceText.length,
      preview: sourceText.slice(0, 120),
      next: '可以调用 analyzeResume 对这份简历进行分析',
    };
  },
});
