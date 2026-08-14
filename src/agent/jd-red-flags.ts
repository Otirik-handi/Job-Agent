import { z } from 'zod';

/**
 * 岗位 JD 危险信号（red flag）与匹配分数区间的确定性检测。
 *
 * 来源：外部 skill job-description-analyzer 炼化结论（docs/research/2026-08-13-refine-01-job-description-analyzer.md
 * §1.3 Step 3/Step 5），短语清单按「中译 + 英文原句」本地化。检测为纯子串匹配，
 * 不依赖 LLM（LLM 会漏检），作为 matchJob 的结构化输出进入结果（确定性护栏，见
 * .agents/specs/03-agent/agent-tooling-conventions.md）。
 */

export const redFlagCategorySchema = z.enum(['workload', 'culture', 'compensation']);

export type RedFlagCategory = z.infer<typeof redFlagCategorySchema>;

/** 一条危险信号规则：同一类别下的多语言短语变体，任一命中即报告 */
export type RedFlagRule = {
  category: RedFlagCategory;
  /** 中文解读（写入结果的说明） */
  label: string;
  /** 中英文短语变体（子串匹配，英文忽略大小写） */
  phrases: string[];
};

/** 封闭清单：新增短语直接在此追加（配单测验证），无需 LLM 参与 */
export const RED_FLAG_RULES: RedFlagRule[] = [
  {
    category: 'workload',
    label: '一人多岗/身兼多职的表述，需确认职责边界',
    phrases: ['wear many hats', '身兼多职', '一人多岗'],
  },
  {
    category: 'workload',
    label: '快节奏环境信号，可能意味着高压与加班',
    phrases: ['fast-paced environment', 'fast-paced', '快节奏'],
  },
  {
    category: 'workload',
    label: '要求立即上手，可能缺乏培养体系与缓冲期',
    phrases: ['hit the ground running', '立即上手', '马上上手', '快速上手'],
  },
  {
    category: 'workload',
    label: '模糊环境下自驱的要求，职责边界可能不明确',
    phrases: ['self-starter in ambiguous situations', '模糊环境中自驱'],
  },
  {
    category: 'culture',
    label: '摇滚明星/忍者/大师类用词（国内常见变体：技术大牛），常暗示过度付出期望',
    phrases: ['rockstar', 'ninja', 'guru', '技术大牛'],
  },
  {
    category: 'culture',
    label: '拼命工作文化信号（work hard, play hard）',
    phrases: ['work hard, play hard', '拼命工作'],
  },
  {
    category: 'culture',
    label: '无限假期/弹性休假表述，常为「无人真休」信号',
    phrases: ['unlimited vacation', '无限假期'],
  },
  {
    category: 'culture',
    label: '「像一家人」式文化表述，常见于边界感弱的小团队',
    phrases: ['like a family', '像一家人', '家文化'],
  },
  {
    category: 'compensation',
    label: '只称薪酬「有竞争力」而未披露区间',
    phrases: ['competitive salary', 'competitive compensation', '有竞争力的薪酬', '薪酬有竞争力'],
  },
  {
    category: 'compensation',
    label: '股权为主、现金报酬可能偏低',
    phrases: ['equity-heavy', 'equity heavy', '股权为主'],
  },
  {
    category: 'compensation',
    label: '纯提成/无底薪结构',
    phrases: ['commission-based', 'commission based', '纯提成', '无底薪'],
  },
  {
    category: 'compensation',
    label: '未披露薪酬区间（视经验而定/薪资面议）',
    phrases: ['doe', '薪资面议', '视经验而定'],
  },
];

/** 一次命中记录：规则、命中的具体短语、中文解读 */
export const redFlagHitSchema = z.object({
  category: redFlagCategorySchema,
  phrase: z.string().describe('命中的危险信号短语'),
  label: z.string().describe('中文解读'),
});

export type RedFlagHit = z.infer<typeof redFlagHitSchema>;

/** 子串检测：英文忽略大小写，中文直接包含匹配；每条规则只记首次命中的短语 */
export function detectJdRedFlags(jdText: string): RedFlagHit[] {
  const lower = jdText.toLowerCase();
  const hits: RedFlagHit[] = [];
  for (const rule of RED_FLAG_RULES) {
    const phrase = rule.phrases.find((p) => lower.includes(p.toLowerCase()));
    if (phrase !== undefined) {
      hits.push({ category: rule.category, phrase, label: rule.label });
    }
  }
  return hits;
}

/**
 * 匹配分区间 → 行动档位（确定性映射，LLM 不可漂移）。
 * 区间语义来自 refine-01 §1.3 Step 3：90-100 过度匹配（flight risk 警示）、
 * 75-89 优秀、60-74 良好、50-59 挑战性、<50 不够格。
 */
export const fitBandSchema = z.enum(['overqualified', 'excellent', 'good', 'stretch', 'underqualified']);

export type FitBand = z.infer<typeof fitBandSchema>;

export function fitBandFromScore(score: number): FitBand {
  if (score >= 90) return 'overqualified';
  if (score >= 75) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 50) return 'stretch';
  return 'underqualified';
}
