import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { LESSON_CATEGORIES, insertLesson } from '../../db/repositories/lessons';

const inputSchema = z.strictObject({
  content: z.string().min(1).describe('教训内容：写清发生了什么 / 为什么 / 下次怎么做，具体可复用，避免空泛描述'),
  category: z.enum(LESSON_CATEGORIES).describe('教训分类：matching 岗位匹配 / marketing 自我营销 / interview 面试 / application 投递流程 / tooling 工具使用 / general 通用'),
  sourceTaskId: z.string().min(1).optional().describe('来源任务标识（可选）：如计划 taskId，用于将教训关联到具体任务场景'),
});

/**
 * 确定性写工具（无 LLM 调用）：沉淀经验教训（失败复盘产出，只追加不修改）。
 * 写入 lessons 表 + lessons_fts 同步；本地可逆写入（认识纠偏可新增纠正性教训），不属强确认档。
 */
export const recordLessonTool = createDomainTool({
  name: 'recordLesson',
  description: '沉淀经验教训：把失败复盘/被纠正后的教训写入 lessons 库（只追加不修改，纠偏以新增纠正性教训沉淀）。参数 content 为教训内容（写清发生了什么/为什么/下次怎么做，具体可复用），category 为分类（matching 匹配 / marketing 营销 / interview 面试 / application 投递 / tooling 工具 / general 通用），sourceTaskId 可选关联计划 taskId。任务失败/受阻（计划 blocked 步骤、工具报错、被用户纠正）或用户认可的关键反馈后调用；用户偏好/进度事实不属于教训（那应写入 setMemory）。返回 ok 与写入的教训（id、content、category、createdAt）。',
  inputSchema,
  progress: { start: '正在记录教训…', done: '教训已记录' },
  execute: async (args) => {
    const content = args.content.trim();
    if (content.length === 0) {
      return {
        ok: false,
        error: {
          code: 'LESSON_INVALID',
          message: '教训内容为空：请写清发生了什么、为什么、下次怎么做',
          hint: '教训需具体可复用：补充发生了什么 / 为什么 / 下次怎么做（如 3-5 句话）后再重试。',
        },
      };
    }
    const record = insertLesson({ content, category: args.category, sourceTaskId: args.sourceTaskId });
    return {
      ok: true,
      lesson: { id: record.id, content: record.content, category: record.category, createdAt: record.createdAt },
    };
  },
});
