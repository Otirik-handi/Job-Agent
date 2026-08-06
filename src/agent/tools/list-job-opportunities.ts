import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { listJobOpportunities } from '../../db/repositories/job-opportunities';

const inputSchema = z.object({});

/**
 * 确定性工具（无 LLM 调用）：列出系统中已导入的岗位。
 * 对话导入的岗位不会自动告知 Agent，匹配/渠道发现/专属简历前需先通过本工具发现岗位并取得 jobOpportunityId。
 */
export const listJobOpportunitiesTool = createDomainTool({
  name: 'listJobOpportunities',
  description: '列出系统中已导入的岗位（jobOpportunityId、公司、职位、状态、是否已匹配）。对已有岗位执行匹配/渠道发现/专属简历前，先调用本工具获取 jobOpportunityId。',
  inputSchema,
  progress: { start: '正在查询系统中的岗位…', done: '岗位列表查询完成' },
  execute: async () => {
    const rows = listJobOpportunities();
    return {
      count: rows.length,
      jobOpportunities: rows.map((j) => ({
        jobOpportunityId: j.id,
        company: j.company,
        title: j.title,
        status: j.status,
        matched: j.fitResultJson !== null,
      })),
    };
  },
});
