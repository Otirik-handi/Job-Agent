/**
 * Offer 红旗清单的确定性检测子集（硬性项）。
 *
 * 来源：外部 skill offer-comparison-analyzer 炼化结论（docs/research/2026-08-13-refine-12
 * §1.5 红旗清单三组 18 条）。确定性可检测项（模糊奖金话术/无流动股权/竞业限制/口头承诺/
 * 年终浮动/长试用期/经营风险表述/职责模糊）代码化；软性项（经理质量/团队健康/成长路径讨论等
 * 依赖主观判断）由 offer-evaluation skill 文本标注"主观"承载（refine-12 §7.5 两档设计）。
 *
 * 当前为规则资产（纯函数 + 单测验证规则正确性），与 offer-evaluation skill 文本同源；
 * 将来 offer 结构化落库（refine-12 方案二）时本模块作为硬性项检查直接复用。
 */

export type OfferRedFlagCategory = 'offer' | 'company' | 'role';

export type OfferRedFlagHit = {
  category: OfferRedFlagCategory;
  label: string;
};

type RedFlagRule = { category: OfferRedFlagCategory; label: string; test: (text: string) => boolean };

const RULES: RedFlagRule[] = [
  {
    category: 'offer',
    label: '奖金/年终话术含上限或区间（"最高 X%"/"0-3 个月"），浮动无保底——按保底比例计算',
    test: (t) =>
      /(最高|上限|up to)\s*\d+\s*(%|个?月|薪)/i.test(t) ||
      /(年终|奖金).{0,8}(0-|1-|2-)\s*\d+\s*个月/.test(t),
  },
  {
    category: 'offer',
    label: '期权/股票未提及归属/行权/回购条款（无流动路径），价值按【不可验证】处理',
    test: (t) => /期权|股票|股权|equity/i.test(t) && !/(归属|行权|回购|vest|cliff|稀释)/i.test(t),
  },
  {
    category: 'offer',
    label: '含竞业限制条款——确认范围、期限与补偿',
    test: (t) => /竞业/.test(t),
  },
  {
    category: 'offer',
    label: '口头承诺未落书面——谈判前请对方邮件/书面确认',
    test: (t) => /口头承诺|口头.{0,6}(说|答应)|微信.{0,6}(说|承诺)/.test(t),
  },
  {
    category: 'offer',
    label: '年终奖浮动（视绩效/不保证）——按保底计算，不并入保底口径',
    test: (t) => /年终/.test(t) && /视绩效|浮动|不保证|取决于/.test(t),
  },
  {
    category: 'offer',
    label: '试用期 6 个月及以上——确认转正标准与试用期薪资折扣',
    test: (t) => /试用期.{0,4}(6|六)\s*(个)?月|试用期.{0,4}半年/.test(t),
  },
  {
    category: 'company',
    label: '公司经营风险表述（裁员/欠薪/降薪/重组）——只引用可查证信息核实',
    test: (t) => /裁员|欠薪|降薪|重组/.test(t),
  },
  {
    category: 'role',
    label: '岗位职责模糊（"职责宽泛/身兼数职"类表述）——确认核心职责边界',
    test: (t) => /职责.{0,8}(宽泛|模糊|不明)|身兼数职|什么都做/.test(t),
  },
];

/** 对 offer 描述文本做确定性红旗检测（硬性项；提示级，不拦截） */
export function offerRedFlagCheck(offerText: string): OfferRedFlagHit[] {
  const hits: OfferRedFlagHit[] = [];
  for (const rule of RULES) {
    if (rule.test(offerText)) hits.push({ category: rule.category, label: rule.label });
  }
  return hits;
}
