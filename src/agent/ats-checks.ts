/**
 * 简历 ATS 兼容性检查（确定性规则，纯文本可检测子集）。
 *
 * 来源：外部 skill resume-ats-optimizer 炼化结论（docs/research/2026-08-13-refine-03）
 * §1.3 检查清单 + §1.6 失败模式——仅实现「纯文本可检测」部分：
 * 区块头命名、日期格式、邮箱特殊字符、电话号码数量、关键词堆砌、文本过短（疑似扫描件）。
 * 字体/表格/多列/图片/页眉页脚等格式依赖项因项目只存纯文本而不适用（refine-03 §5.2）。
 * 全部为提示级检查（不拦截），输出给 analyze-resume 的 atsChecks。
 */

export type AtsCheck = {
  check: string;
  ok: boolean;
  /** 不通过时的中文说明（通过时为 undefined） */
  issue?: string;
};

/** 非常规区块名（ATS 失败模式 Pattern 2）：命中即提示改用标准名 */
const NON_STANDARD_HEADERS = [
  '我的旅程', '我去过的地方', '学术追求', '职场足迹', '心路历程',
  'my journey', "where i've been", 'academic pursuits', 'what i bring to the table',
];

/** 标准区块关键词（任一命中即认为存在该区块） */
const SECTION_KEYWORDS = {
  skills: ['技能', '专业技能', '核心能力', 'skill'],
  experience: ['工作经历', '项目经历', '实习经历', '职业经历', '工作经验', 'experience'],
  education: ['教育经历', '教育背景', '学历', 'education'],
} as const;

/** 日期样式：中文年月（2023年6月 / 2023 年 6 月）或数字式（2023.06 / 2023/06 / 2023-06） */
const DATE_PATTERN = /20\d{2}\s*年\s*\d{1,2}\s*月|20\d{2}[./-]\d{1,2}/g;

/** 标准邮箱（ASCII）；含全角 @ 视为不可解析 */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** 国内手机号（用于"多个电话号码"检查） */
const PHONE_PATTERN = /1[3-9]\d{9}/g;

/** 高频重复阈值（同一词/二元组出现次数 ≥ 本值 → 疑似关键词堆砌） */
const STUFFING_THRESHOLD = 6;

function countAsciiWords(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of text.toLowerCase().matchAll(/[a-z]{4,}/g)) {
    const word = m[0];
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

function countCjkBigrams(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  const chars = text.replace(/[^\u4e00-\u9fa5]/g, '');
  for (let i = 0; i < chars.length - 1; i++) {
    const bigram = chars.slice(i, i + 2);
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }
  return counts;
}

/** 对纯文本简历运行全部 ATS 检查（确定性子集），返回检查结果数组 */
export function runAtsChecks(text: string): AtsCheck[] {
  const checks: AtsCheck[] = [];
  const trimmed = text.trim();

  // 1. 文本过短：疑似扫描件/图片简历（导入时已限定文件格式，这里兜底纯文本可检测项）
  checks.push({
    check: '文本可提取性',
    ok: trimmed.length >= 80,
    issue: trimmed.length < 80
      ? '简历文本过短，疑似扫描件或图片型简历——ATS 无法解析图片中的文字，请提供文本型简历'
      : undefined,
  });

  // 2. 标准区块头缺失
  const missing = (Object.keys(SECTION_KEYWORDS) as Array<keyof typeof SECTION_KEYWORDS>)
    .filter((key) => !SECTION_KEYWORDS[key].some((k) => trimmed.toLowerCase().includes(k.toLowerCase())));
  checks.push({
    check: '标准区块头',
    ok: missing.length === 0,
    issue: missing.length > 0
      ? `未检测到 ${missing.map((m) => ({ skills: '技能', experience: '经历', education: '教育' })[m]).join('、')} 类区块标题，ATS 可能无法识别对应内容`
      : undefined,
  });

  // 3. 非常规区块名
  const unusual = NON_STANDARD_HEADERS.find((h) => trimmed.toLowerCase().includes(h.toLowerCase()));
  checks.push({
    check: '区块头命名',
    ok: unusual === undefined,
    issue: unusual ? `检测到非常规区块名「${unusual}」，建议改用标准命名（如「工作经历」「教育」「技能」）` : undefined,
  });

  // 4. 日期格式统一
  const styles = new Set<string>();
  for (const m of trimmed.matchAll(DATE_PATTERN)) {
    const raw = m[0];
    if (raw.includes('年')) styles.add('中文年月');
    else {
      const sep = raw.match(/[./-]/)?.[0];
      if (sep) styles.add(`分隔符${sep}`);
    }
  }
  checks.push({
    check: '日期格式',
    ok: styles.size <= 1,
    issue: styles.size > 1
      ? `日期格式不统一（检测到 ${[...styles].join('、')}），建议统一为「2023.06」或「2023 年 6 月」`
      : undefined,
  });

  // 5. 邮箱特殊字符（全角 @ 或 @ 无法按标准邮箱解析）
  const fullWidthAt = trimmed.includes('＠');
  const hasAt = trimmed.includes('@');
  const emailOk = EMAIL_PATTERN.test(trimmed) || !hasAt;
  checks.push({
    check: '联系方式格式',
    ok: !fullWidthAt && emailOk,
    issue: fullWidthAt
      ? '邮箱使用全角「＠」，ATS 可能无法解析，请改为半角 @'
      : hasAt && !emailOk
        ? '邮箱格式异常（含特殊字符），请使用标准邮箱格式'
        : undefined,
  });

  // 6. 多个电话号码
  const phones = trimmed.match(PHONE_PATTERN) ?? [];
  checks.push({
    check: '联系电话',
    ok: phones.length <= 1,
    issue: phones.length > 1 ? `检测到 ${phones.length} 个手机号，建议只保留一个联系方式` : undefined,
  });

  // 7. 疑似关键词堆砌（同一词/二元组高频重复）
  const stuffed = [...countAsciiWords(trimmed).entries(), ...countCjkBigrams(trimmed).entries()]
    .filter(([, n]) => n >= STUFFING_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w, n]) => `「${w}」×${n}`);
  checks.push({
    check: '关键词密度',
    ok: stuffed.length === 0,
    issue: stuffed.length > 0
      ? `疑似关键词堆砌（${stuffed.join('、')}），建议自然融入表述而非重复罗列`
      : undefined,
  });

  return checks;
}
