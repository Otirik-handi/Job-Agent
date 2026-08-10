import { eq } from 'drizzle-orm';
import { db } from '../index';
import { memoryBlocks } from '../schema';
import { nowIso } from './shared';

/** 记忆块固定枚举（新增记忆块必须先更新本常量与仓库规范再落库） */
export const MEMORY_BLOCK_LABELS = ['resume', 'preferences', 'status_scratchpad'] as const;
export type MemoryBlockLabel = (typeof MEMORY_BLOCK_LABELS)[number];

/** 各记忆块的用途说明与字符上限（写入 memory_blocks 表，供 Agent 判断何时读写） */
export const MEMORY_BLOCK_DEFS: Record<MemoryBlockLabel, { description: string; limit: number }> = {
  resume: { description: '简历要点画像（学历/技能/年限/项目经验），供岗位匹配与面试参考', limit: 4000 },
  preferences: { description: '用户求职偏好（目标岗位/城市/薪资/远程/行业等），写入前需与用户核对', limit: 2000 },
  status_scratchpad: { description: '各岗位投递流程进度速记（自由文本，Agent 自用）', limit: 1500 },
};

export type MemoryBlockRecord = {
  label: string; description: string; value: string; limit: number; updatedAt: string;
};

export function getMemoryBlock(label: string): MemoryBlockRecord | null {
  return db.select().from(memoryBlocks).where(eq(memoryBlocks.label, label)).get() ?? null;
}

export function listMemoryBlocks(): MemoryBlockRecord[] {
  return db.select().from(memoryBlocks).all();
}

export function setMemoryBlock(label: string, value: string): MemoryBlockRecord {
  const def = MEMORY_BLOCK_DEFS[label as MemoryBlockLabel];
  if (!def) {
    throw new Error(`未知记忆块 label: ${label}（合法值: ${MEMORY_BLOCK_LABELS.join(', ')}）`);
  }
  if (value.length > def.limit) {
    throw new Error(`记忆块 ${label} 内容超长（${value.length} > ${def.limit} 字符上限）`);
  }
  const record: MemoryBlockRecord = {
    label, description: def.description, value, limit: def.limit, updatedAt: nowIso(),
  };
  db.insert(memoryBlocks).values(record)
    .onConflictDoUpdate({ target: memoryBlocks.label, set: { value: record.value, updatedAt: record.updatedAt } })
    .run();
  return record;
}
