/**
 * JD 关键词与简历文本的匹配分析（确定性计算）。
 *
 * 来源：外部 skill resume-ats-optimizer 炼化结论（docs/research/2026-08-13-refine-03）
 * §1.4 关键词优化流程——匹配分 = 命中数/总数 × 100（机器视角的关键词命中率，
 * 与 matchJob 的 LLM 语义匹配分互补对照）。第一版只做精确短语匹配（变体识别
 * "接近但不精确"暂缺，refine-03 §4 方案二为后续增强方向）。
 *
 * 关键词清单（hard/soft/industry 三类）由 LLM 从 JD 提取，本文档只做确定性计算：
 * 命中数、出现频次、所在区块（摘要/技能/经历/项目/教育）与缺失清单。
 */

export type KeywordType = 'hard' | 'soft' | 'industry';

export type KeywordInput = {
  term: string;
  type: KeywordType;
};

export type KeywordMatchItem = {
  term: string;
  type: KeywordType;
  matched: boolean;
  /** 在简历文本中的出现次数（英文忽略大小写） */
  count: number;
  /** 命中的区块（未识别到区块时为空数组） */
  locations: string[];
};

export type KeywordMatchResult = {
  /** 关键词匹配分：命中数/总数 × 100（四舍五入整数；无关键词时为 0） */
  keywordMatchScore: number;
  keywordTotal: number;
  keywordHitCount: number;
  keywordResults: KeywordMatchItem[];
  missingKeywords: Array<{ term: string; type: KeywordType }>;
};

/** 标准区块头（行首锚定，长词优先）——用于定位关键词所在区块 */
const SECTION_HEADER_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: '摘要', regex: /(^|\n)\s*(个人摘要|自我评价|职业概述|PROFESSIONAL SUMMARY|SUMMARY)\s*[:：]?/i },
  { label: '技能', regex: /(^|\n)\s*(专业技能|技能清单|核心能力|技能|SKILLS)\s*[:：]?/i },
  { label: '经历', regex: /(^|\n)\s*(工作经历|职业经历|工作经验|实习经历|EXPERIENCE)\s*[:：]?/i },
  { label: '项目', regex: /(^|\n)\s*(项目经历|项目经验|PROJECTS)\s*[:：]?/i },
  { label: '教育', regex: /(^|\n)\s*(教育经历|教育背景|EDUCATION)\s*[:：]?/i },
];

type Section = { label: string; start: number; end: number };

/** 按行首锚定的标准区块头切分文本；返回按位置排序的区块（end 为下一个区块起点或文本末尾） */
export function findSections(text: string): Section[] {
  const matches: Array<{ label: string; index: number }> = [];
  for (const { label, regex } of SECTION_HEADER_PATTERNS) {
    const m = regex.exec(text);
    if (m) matches.push({ label, index: m.index });
  }
  matches.sort((a, b) => a.index - b.index);
  return matches.map((m, i) => ({
    label: m.label,
    start: m.index,
    end: i + 1 < matches.length ? matches[i + 1].index : text.length,
  }));
}

function countOccurrences(text: string, term: string): number {
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  if (!lowerTerm) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = lowerText.indexOf(lowerTerm, from);
    if (idx === -1) break;
    count += 1;
    from = idx + lowerTerm.length;
  }
  return count;
}

/** 对 LLM 提取的 JD 关键词清单做确定性匹配分析 */
export function computeKeywordMatch(keywords: KeywordInput[], resumeText: string): KeywordMatchResult {
  const sections = findSections(resumeText);
  const results: KeywordMatchItem[] = keywords.map(({ term, type }) => {
    const count = countOccurrences(resumeText, term);
    const locations = count > 0
      ? sections
          .filter((s) => resumeText.slice(s.start, s.end).toLowerCase().includes(term.toLowerCase()))
          .map((s) => s.label)
      : [];
    return { term, type, matched: count > 0, count, locations };
  });
  const hitCount = results.filter((r) => r.matched).length;
  return {
    keywordMatchScore: results.length > 0 ? Math.round((hitCount / results.length) * 100) : 0,
    keywordTotal: results.length,
    keywordHitCount: hitCount,
    keywordResults: results,
    missingKeywords: results.filter((r) => !r.matched).map(({ term, type }) => ({ term, type })),
  };
}
