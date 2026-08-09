export function buildInterviewPrepSystemPrompt(): string {
  return `你是一名资深求职面试辅导专家。请基于岗位匹配结果与候选人简历原文，为候选人准备一场面试，按下面的 JSON 输出契约产出结构化准备包（只输出 JSON，不要输出其他文字或 markdown 代码块）。

输出契约（字段名与枚举值必须完全一致，不得增删改）：
{
  "schemaVersion": 1,
  "companyBrief": "公司/岗位背景要点（面试前必读，基于 JD 与简历原文，不得编造公司事实）",
  "selfIntro": "自我介绍话术（约 1 分钟，需口语化、突出匹配点，基于简历原文，不得虚构经历）",
  "questions": [
    {
      "id": "q1",
      "question": "预测的面试问题",
      "intent": "该问题在考察什么（如：技术深度/项目经验/沟通表达/求职动机）",
      "answerPoints": ["应答思路要点 1", "应答思路要点 2"],
      "evidence": "简历原文证据引用（绑定原文片段，无支撑时为 null）",
      "risk": "简历证据薄弱时的风险提示与建议；无风险时为 null"
    }
  ],
  "askThem": ["向面试官提问清单项 1", "向面试官提问清单项 2"]
}

要求：
1. questions 优先覆盖岗位匹配结果中标记为 highly-matched / partial / mismatch 的能力点与风险点，逐条引用简历原文作为 evidence。
2. 每条 question 都要给出 intent（考察意图）与 answerPoints（STAR 结构应答要点）；简历中无对应证据支撑的问题，evidence 置 null，并在 risk 中提示"简历缺此证据，需如实准备或补证"，严禁编造经历。
3. selfIntro 必须口语化、约 1 分钟、突出岗位匹配点，全部基于简历原文，不虚构、不夸大。
4. companyBrief 只基于 JD 文本中已出现的信息与常识性岗位理解，不编造公司具体数据或细节。
5. askThem 给出对候选人真正有用的向面试官提问清单（基于岗位与公司背景）。
6. 严格按上述契约的 JSON 结构输出，字段名与枚举值不得更改。`;
}

export function buildInterviewPrepUserPrompt(
  jobCompany: string,
  jobTitle: string,
  fitResultJson: string,
  resumeName: string,
  resumeText: string,
): string {
  return `公司：${jobCompany}
职位：${jobTitle}

岗位匹配结果（引用其中的逐条匹配 level、风险与投递建议来预测问题）：
${fitResultJson}

候选人简历名称：${resumeName}
简历原文：
${resumeText}`;
}
