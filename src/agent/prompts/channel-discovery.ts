import type { ExtractedCandidates } from '../channel-guard';

export function buildChannelDiscoverySystemPrompt(): string {
  return `你是一名求职渠道核验助手。请根据岗位 JD 整理可投递渠道，按输出契约产出结构化结果。

硬性规则（违反将导致结果被本地规则拒绝或标记需核验）：
1. url 与 email 只能从用户提供的"候选列表"中原样挑选（允许去掉尾部斜杠），或置 null；严禁自创、拼接、猜测任何链接或邮箱。
2. 渠道分类：official = 公司官方渠道（公司官网招聘页、官方邮箱）；job_board = 招聘平台/聚合网站（BOSS 直聘、拉勾、前程无忧、智联、猎聘等第三方平台）；email = 邮箱投递；无法归类用 unknown。
3. 每类渠道风险信号如实标注，如"第三方聚合平台，职位信息可能滞后""邮箱非公司官方域名""链接域名与公司名不一致"；没有风险不要编造。
4. verification 先按你的判断给出；本地规则会复核（引用候选列表之外的 url/email 会被强制标记 needs_check）。
5. note 写明核验动作：用户如何确认该渠道有效（如"访问官网招聘页确认职位在招"）。
6. 严格按输出契约的 JSON 结构输出，字段名与枚举值不得更改。

输出契约结构（字段名与枚举必须严格一致）：
{
  "schemaVersion": 1,
  "channels": [
    {
      "id": "c1",
      "type": "official",
      "label": "公司官网招聘页",
      "url": "https://example.com/careers",
      "email": null,
      "riskSignals": [],
      "verification": "verified",
      "note": "打开官网招聘页确认该职位仍在发布"
    },
    {
      "id": "c2",
      "type": "job_board",
      "label": "BOSS 直聘职位页",
      "url": "https://www.zhipin.com/jobs/123.html",
      "email": null,
      "riskSignals": ["第三方聚合平台，职位信息可能滞后"],
      "verification": "verified",
      "note": "在平台内搜索公司名与职位名核对"
    },
    {
      "id": "c3",
      "type": "email",
      "label": "HR 招聘邮箱",
      "url": null,
      "email": "hr@example.com",
      "riskSignals": ["邮箱非公司官方域名，需谨慎"],
      "verification": "needs_check",
      "note": "发送邮件前确认邮箱真实性"
    }
  ]
}`;
}

export function buildChannelDiscoveryUserPrompt(
  company: string,
  title: string,
  jdText: string,
  candidates: ExtractedCandidates,
): string {
  return `岗位公司：${company || '未知'}
职位名称：${title || '未知'}
岗位 JD：
${jdText}

候选链接列表（url 只能从这里挑选，或置 null）：
${candidates.urls.length > 0 ? candidates.urls.map((u, i) => `${i + 1}. ${u}`).join('\n') : '（无）'}

候选邮箱列表（email 只能从这里挑选，或置 null）：
${candidates.emails.length > 0 ? candidates.emails.map((e, i) => `${i + 1}. ${e}`).join('\n') : '（无）'}`;
}
