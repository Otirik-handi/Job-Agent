/**
 * 简历 bullet 改写质量确定性校验（建议阶段输出后校验）。
 *
 * 来源：外部 skill resume-bullet-writer / resume-quantifier 炼化结论
 * （docs/research/2026-08-13-refine-04 §1.9 检查清单 / refine-05 §1.9-1.10 Numbers to Avoid）。
 * 只做「文本可确定性检测」项：含数字、长度（约 2 行内）、弱动词开头、
 * 数字数量上限（≤3）、百分比无基线。语义项（具体结果/成就而非职责/与岗位相关）
 * 由 prompt 要求承载（混合形态，refine-04 §4 方案一）。
 * 结果为提示级（qualityWarnings），不拦截、不剔除建议。
 */

export type BulletQualityWarning = {
  editId: string;
  issues: string[];
};

/** 弱/被动开头（命中即提示换强动词） */
const WEAK_STARTS = [
  '负责', '协助', '参与', '帮忙', '配合',
  'responsible for', 'helped', 'assisted', 'participated', 'worked on',
];

/** 数字（阿拉伯/全角数字；global 供 match 统计个数） */
const NUMBER_RE = /[0-9０-９]+(?:[.．]\d+)?/g;

/** 百分比 */
const PERCENT_RE = /[0-9０-９]+\s*%/;

/** 基线提示词（百分比附近有 from/to/从/由/到 视为有基线） */
const BASELINE_HINT_RE = /(从|由|from|to|到)/;

/** 长度上限（约 2 行；中文信息密度高，按字符数折算） */
const MAX_LENGTH = 100;

/** 单条 bullet 数字数量上限（refine-05 §1.10：2-3 个） */
const MAX_NUMBERS = 3;

/** 对建议清单逐条校验 suggestedText 质量，返回不合格条目的问题清单 */
export function validateBulletQuality(edits: Array<{ id: string; suggestedText: string }>): BulletQualityWarning[] {
  const warnings: BulletQualityWarning[] = [];
  for (const edit of edits) {
    const text = edit.suggestedText.trim();
    const lower = text.toLowerCase();
    const issues: string[] = [];

    if (!NUMBER_RE.test(text)) {
      issues.push('缺少数字/量化指标（数量、金额、百分比、规模等至少一项）');
    }
    if (text.length > MAX_LENGTH) {
      issues.push('表述过长（约 2 行以上），建议精简为 1-2 行并保留最亮眼的指标');
    }
    if (WEAK_STARTS.some((w) => lower.startsWith(w))) {
      issues.push('以被动/弱动词开头（负责/协助/参与），建议改为主动强动词（带领/主导/搭建/优化等）');
    }
    const numbers = text.match(NUMBER_RE) ?? [];
    if (numbers.length > MAX_NUMBERS) {
      issues.push(`数字过多（${numbers.length} 个），建议每条 bullet 最多 ${MAX_NUMBERS} 个数字`);
    }
    if (PERCENT_RE.test(text) && !BASELINE_HINT_RE.test(text)) {
      issues.push('百分比缺少基线（如"从 X 提升到 Y"），无法体现改进幅度');
    }

    if (issues.length > 0) warnings.push({ editId: edit.id, issues });
  }
  return warnings;
}
