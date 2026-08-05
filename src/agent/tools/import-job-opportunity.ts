import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { createJobOpportunity } from '../../db/repositories/job-opportunities';
import { assertTextLength, normalizeResumeText } from '../resume-text';

const inputSchema = z.object({
  text: z.string().min(1).describe('岗位 JD 文本（粘贴）'),
});

export const importJobOpportunityTool = createDomainTool({
  name: 'importJobOpportunity',
  description: '导入岗位：接受粘贴的 JD 文本。导入后返回 jobOpportunityId，可用 matchJob 进行匹配分析。',
  inputSchema,
  progress: { start: '正在保存岗位信息…', done: '岗位导入完成' },
  execute: async (args) => {
    const jdText = normalizeResumeText(args.text);
    assertTextLength(jdText); // 复用文本上限（80000 字符）

    const record = createJobOpportunity(jdText);

    return {
      jobOpportunityId: record.id,
      charCount: jdText.length,
      preview: jdText.slice(0, 120),
      next: '可以调用 matchJob 对这份岗位进行匹配分析',
    };
  },
});
