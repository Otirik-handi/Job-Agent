import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { listJobOpportunities } from '../../db/repositories/job-opportunities';
import { getLatestApplyActionDetails } from '../../db/repositories/actions';
import { getTailoredResume } from '../../db/repositories/tailored-resumes';

const inputSchema = z.strictObject({});

/**
 * 确定性工具（无 LLM 调用）：列出系统中已导入的岗位。
 * 对话导入的岗位不会自动告知 Agent，匹配/渠道发现/专属简历前需先通过本工具发现岗位并取得 jobOpportunityId。
 * appliedTailoredResume 为投递-版本关联（refine-06）：最近一次成功投递所用专属简历版本，可回答"我投 X 用的哪个版本"。
 */
export const listJobOpportunitiesTool = createDomainTool({
  name: 'listJobOpportunities',
  description: '列出系统中已导入的全部岗位，供获取 jobOpportunityId 复用。用户要求对已有岗位执行匹配、渠道发现、专属简历、投递或面试准备但未提供 jobOpportunityId 时，先调用本工具发现岗位。无参数，只读无副作用。返回 ok、count 与岗位列表（jobOpportunityId、company、title、status、matched 是否已匹配、appliedTailoredResume 最近一次投递所用专属简历版本——用户问"投的哪个版本"时以此回答）。',
  inputSchema,
  progress: { start: '正在查询系统中的岗位…', done: '岗位列表查询完成' },
  execute: async () => {
    const rows = listJobOpportunities();
    return {
      ok: true,
      count: rows.length,
      jobOpportunities: rows.map((j) => {
        // 投递-版本关联：最近一次成功投递的审计明细 → 专属简历版本（存量无记录 → null）
        const details = getLatestApplyActionDetails(j.id);
        const tailored = details ? getTailoredResume(details.tailoredResumeId) : null;
        return {
          jobOpportunityId: j.id,
          company: j.company,
          title: j.title,
          status: j.status,
          matched: j.fitResultJson !== null,
          appliedTailoredResume: tailored
            ? { id: tailored.id, version: tailored.version }
            : null,
        };
      }),
    };
  },
});
