export type InterviewPrepMdInput = {
  companyBrief: string;
  selfIntro: string;
  questions: Array<{ id: string; question: string; intent: string; answerPoints: string[]; evidence: string | null; risk: string | null; probability?: 'high' | 'medium' | 'low' }>;
  redFlags?: string[];
  askThem: string[];
};

const PROBABILITY_LABELS: Record<string, string> = { high: '高概率', medium: '中概率', low: '低概率' };

/** 面试准备包 → Markdown 文本（导出用；风险为空的问题省略风险行） */
export function toInterviewPrepMarkdown(prep: InterviewPrepMdInput): string {
  const lines: string[] = ['# 面试准备', ''];

  lines.push('## 公司与岗位背景', '', prep.companyBrief, '');

  lines.push('## 自我介绍', '', prep.selfIntro, '');

  lines.push('## 预测面试问题', '');
  for (const q of prep.questions) {
    lines.push(`### ${q.id} ${q.question}`, '');
    const meta = q.probability ? `被问概率：${PROBABILITY_LABELS[q.probability] ?? q.probability}` : null;
    lines.push([`考察意图：${q.intent}`, meta].filter(Boolean).join('　|　'), '');
    lines.push('应答思路：');
    for (const p of q.answerPoints) lines.push(`- ${p}`);
    lines.push('');
    if (q.evidence) lines.push(`简历证据：${q.evidence}`, '');
    if (q.risk) lines.push(`风险提示：${q.risk}`, '');
  }

  if (prep.redFlags && prep.redFlags.length > 0) {
    lines.push('## 红线答案提示', '');
    for (const r of prep.redFlags) lines.push(`- ${r}`);
    lines.push('');
  }

  lines.push('## 向面试官提问', '');
  for (const q of prep.askThem) lines.push(`- ${q}`);
  lines.push('');

  return lines.join('\n');
}
