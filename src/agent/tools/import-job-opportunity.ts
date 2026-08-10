import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { createJobOpportunity } from '../../db/repositories/job-opportunities';
import { assertTextLength, normalizeResumeText, ResumeTextError } from '../resume-text';

const inputSchema = z.object({
  text: z.string().min(1).describe('岗位 JD 文本（粘贴）'),
});

export const importJobOpportunityTool = createDomainTool({
  name: 'importJobOpportunity',
  description: '导入岗位：将用户粘贴的 JD 文本保存到系统。参数 text 为岗位 JD 文本（粘贴，字符上限 80000，超限返回错误需精简后重试）。仅当用户提供新岗位 JD 时调用；岗位已在系统中时应先调用 listJobOpportunities 获取 jobOpportunityId 复用。返回 ok、jobOpportunityId、charCount 与文本预览，导入后可用 matchJob 匹配、discoverChannels 发现投递渠道。',
  inputSchema,
  progress: { start: '正在保存岗位信息…', done: '岗位导入完成' },
  execute: async (args) => {
    const jdText = normalizeResumeText(args.text);
    try {
      assertTextLength(jdText); // 复用文本上限（80000 字符）
    } catch (err) {
      if (err instanceof ResumeTextError) {
        return {
          ok: false,
          error: {
            code: 'TEXT_TOO_LONG',
            message: err.message,
            hint: 'JD 文本超过 80000 字符上限：请精简内容（如去除排版噪声）后重试。',
          },
        };
      }
      throw err;
    }

    const record = createJobOpportunity(jdText);

    return {
      ok: true,
      jobOpportunityId: record.id,
      charCount: jdText.length,
      preview: jdText.slice(0, 120),
      next: '可以调用 matchJob 对这份岗位进行匹配分析',
    };
  },
});
