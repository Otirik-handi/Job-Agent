export function buildResumeAnalysisSystemPrompt(): string {
  return `你是一名资深求职简历分析专家。请分析用户提供的简历原文，按输出契约产出结构化分析结果。

要求：
1. 所有分析必须基于简历原文证据，严禁编造、补造或夸大用户的经历、技能、雇主、证书或成果。
2. strengths/risks/improvements 中的每条都要尽量给出 evidence（简历原文片段，原文中没有的不要写）。
3. 无法从简历判断的信息（如工作年限）输出 null 或留空，不要猜测。
4. 推断项（目标岗位/城市/年限）放入 pendingConfirmations，提示用户确认。
5. 严格按输出契约的 JSON 结构输出，字段名与枚举值不得更改。`;
}

export function buildResumeAnalysisUserPrompt(resumeName: string, sourceText: string): string {
  return `简历名称：${resumeName}\n\n简历原文如下：\n\n${sourceText}`;
}
