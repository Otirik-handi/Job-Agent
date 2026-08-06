/** 专属简历定点替换纯函数（无 I/O）：
 *  每条建议的 sourceText 必须在简历原文唯一匹配（经验 #4），
 *  全部通过唯一性校验后才执行替换生成新简历 markdown。 */

export type ResumeEdit = { id: string; sourceText: string; suggestedText: string };

export type EditFailureCode = 'EDIT_SOURCE_NOT_FOUND' | 'EDIT_SOURCE_AMBIGUOUS';

export type EditValidationResult =
  | { ok: true; index: number }
  | { ok: false; code: EditFailureCode };

/** 校验 sourceText 在文本中是否唯一匹配：0 次 → NOT_FOUND，≥2 次 → AMBIGUOUS，1 次 → 返回位置 */
export function findUniqueMatch(text: string, sourceText: string): EditValidationResult {
  if (!sourceText) return { ok: false, code: 'EDIT_SOURCE_NOT_FOUND' };
  let first = -1;
  let count = 0;
  let idx = text.indexOf(sourceText);
  while (idx !== -1) {
    if (count === 0) first = idx;
    count++;
    if (count > 1) return { ok: false, code: 'EDIT_SOURCE_AMBIGUOUS' };
    idx = text.indexOf(sourceText, idx + sourceText.length);
  }
  if (count === 0) return { ok: false, code: 'EDIT_SOURCE_NOT_FOUND' };
  return { ok: true, index: first };
}

/** 校验编辑清单，返回有效/无效分组（无效条目带失败原因） */
export function validateEdits(
  resumeText: string,
  edits: ResumeEdit[],
): { valid: ResumeEdit[]; invalid: { edit: ResumeEdit; code: EditFailureCode }[] } {
  const valid: ResumeEdit[] = [];
  const invalid: { edit: ResumeEdit; code: EditFailureCode }[] = [];
  const seenSources = new Set<string>();
  for (const e of edits) {
    const m = findUniqueMatch(resumeText, e.sourceText);
    if (!m.ok) {
      invalid.push({ edit: e, code: m.code });
    } else if (seenSources.has(e.sourceText)) {
      // 同 sourceText 被多条建议引用：替换会互相冲突，视为歧义失败
      invalid.push({ edit: e, code: 'EDIT_SOURCE_AMBIGUOUS' });
    } else {
      seenSources.add(e.sourceText);
      valid.push(e);
    }
  }
  return { valid, invalid };
}

/** 应用替换生成新 markdown：全部通过唯一性校验才替换，任一失败则整体不执行 */
export function applyEdits(
  resumeText: string,
  edits: ResumeEdit[],
): { ok: true; markdown: string; appliedCount: number } | { ok: false; code: EditFailureCode; failedEdits: ResumeEdit[] } {
  const { valid, invalid } = validateEdits(resumeText, edits);
  if (invalid.length > 0) {
    return { ok: false, code: invalid[0].code, failedEdits: invalid.map((i) => i.edit) };
  }
  // 按位置从后往前替换，避免位移影响后续定位
  const entries = valid
    .map((e) => ({ edit: e, index: findUniqueMatch(resumeText, e.sourceText) as { ok: true; index: number } }))
    .sort((a, b) => b.index.index - a.index.index);
  let markdown = resumeText;
  let appliedCount = 0;
  for (const { edit, index } of entries) {
    markdown = markdown.slice(0, index.index) + edit.suggestedText + markdown.slice(index.index + edit.sourceText.length);
    appliedCount++;
  }
  return { ok: true, markdown, appliedCount };
}
