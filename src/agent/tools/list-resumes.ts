import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { listResumes } from '../../db/repositories/resumes';

const inputSchema = z.object({});

/**
 * 确定性工具（无 LLM 调用）：列出系统中已导入的简历。
 * 网页上传/对话导入的简历不会自动告知 Agent，分析前需先通过本工具发现简历并取得 resumeId。
 */
export const listResumesTool = createDomainTool({
  name: 'listResumes',
  description: '列出系统中已导入的全部简历，供获取 resumeId 复用。用户要求分析简历、匹配岗位或生成专属简历但未提供 resumeId 时，先调用本工具发现系统简历。无参数，只读无副作用。返回 ok、count 与简历列表（resumeId、name、sourceType、analyzed 是否已分析）。',
  inputSchema,
  progress: { start: '正在查询系统中的简历…', done: '简历列表查询完成' },
  execute: async () => {
    const rows = listResumes();
    return {
      ok: true,
      count: rows.length,
      resumes: rows.map((r) => ({
        resumeId: r.id,
        name: r.name,
        sourceType: r.sourceType,
        analyzed: r.analysisJson !== null,
      })),
    };
  },
});
