import { z } from 'zod';

/** 渠道发现契约 v1（产物内嵌 schemaVersion；URL/邮箱必须引用 JD 本地提取集合） */
export const channelDiscoveryResultSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  channels: z.array(z.object({
    id: z.string().regex(/^c\d+$/).describe('渠道编号，稳定 id：c1、c2…'),
    type: z.enum(['official', 'job_board', 'email', 'unknown'])
      .describe('渠道类型：official 官方渠道 / job_board 招聘平台 / email 邮箱投递 / unknown 无法归类'),
    label: z.string().describe('渠道展示名（如"公司官网投递页""HR 招聘邮箱"），来自 JD 上下文'),
    url: z.string().nullable().describe('投递链接；必须原样引用候选 URL 列表中的值，无则 null，严禁自创'),
    email: z.string().nullable().describe('投递邮箱；必须原样引用候选邮箱列表中的值，无则 null，严禁自创'),
    riskSignals: z.array(z.string()).max(5).describe('风险信号（如"第三方聚合平台需注意真实性""邮箱非公司域名"），无则空数组'),
    verification: z.enum(['verified', 'needs_check'])
      .describe('核验状态：verified 已核验 / needs_check 需进一步核验（本地规则会复核）'),
    note: z.string().describe('核验动作说明（如何确认该渠道有效性）'),
  })).min(1).max(10),
});

export type ChannelDiscoveryResultV1 = z.infer<typeof channelDiscoveryResultSchemaV1>;
