import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import {
  buildRetryMessage,
  collectToolSteps,
  extractSuccessDetails,
  extractSuccessSummary,
  toolLabel,
} from './tool-step-card';

/** 构造测试用 UIMessage（parts 直接传原始对象，类型以 UIMessage 兜底） */
function message(parts: unknown[]): UIMessage {
  return { id: 'm1', role: 'assistant', parts } as unknown as UIMessage;
}

/** 静态工具 part 快捷构造 */
function staticPart(
  toolName: string,
  state: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type: `tool-${toolName}`, toolCallId: `tc-${toolName}`, state, ...extra };
}

/** 动态工具 part 快捷构造 */
function dynamicPart(toolName: string, state: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'dynamic-tool', toolName, toolCallId: `tc-${toolName}`, state, ...extra };
}

describe('collectToolSteps（tool part 识别 + 三态判定）', () => {
  it('静态 tool part 输出完成（ok:true）→ completed，output 保留', () => {
    const output = { ok: true, count: 3, resumes: [] };
    const steps = collectToolSteps(message([staticPart('listResumes', 'output-available', { output })]));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      toolCallId: 'tc-listResumes',
      toolName: 'listResumes',
      state: 'completed',
      errorMessage: null,
    });
    expect(steps[0].output).toEqual(output);
  });

  it('业务失败 {ok:false, error:{code,message,hint}} → failed，提取 message 与 hint', () => {
    const output = {
      ok: false,
      error: { code: 'JOB_MATCH_REQUIRED', message: '岗位尚未匹配', hint: '请先调用 matchJob' },
    };
    const steps = collectToolSteps(message([staticPart('applyJob', 'output-available', { output })]));
    expect(steps).toHaveLength(1);
    expect(steps[0].state).toBe('failed');
    expect(steps[0].errorMessage).toBe('岗位尚未匹配');
    expect(steps[0].errorHint).toBe('请先调用 matchJob');
  });

  it('业务失败但 error 结构缺失 → 兜底文案「工具执行失败」', () => {
    const output = { ok: false };
    const steps = collectToolSteps(message([staticPart('applyJob', 'output-available', { output })]));
    expect(steps[0].state).toBe('failed');
    expect(steps[0].errorMessage).toBe('工具执行失败');
    expect(steps[0].errorHint).toBeNull();
  });

  it('工具执行异常（output-error）→ failed，取 errorText', () => {
    const steps = collectToolSteps(
      message([staticPart('matchJob', 'output-error', { errorText: '模型调用失败' })]),
    );
    expect(steps[0]).toMatchObject({ state: 'failed', errorMessage: '模型调用失败' });
  });

  it('input-available → running（运行中）', () => {
    const steps = collectToolSteps(message([staticPart('analyzeResume', 'input-available', { input: {} })]));
    expect(steps[0]).toMatchObject({ state: 'running', errorMessage: null });
  });

  it('input-streaming → running（运行中）', () => {
    const steps = collectToolSteps(message([staticPart('analyzeResume', 'input-streaming')]));
    expect(steps[0].state).toBe('running');
  });

  it('dynamic-tool part：识别 toolName 并参与三态判定', () => {
    const output = { ok: true, taskId: 'weekly-report', planMarkdown: '...' };
    const steps = collectToolSteps(message([dynamicPart('planCreate', 'output-available', { output })]));
    expect(steps[0]).toMatchObject({ toolName: 'planCreate', state: 'completed' });
  });

  it('recordApplicationStatus 预览态（ok:true + phase:preview）→ 排除（确认卡渲染）', () => {
    const output = { ok: true, phase: 'preview', jobOpportunityId: 'j1', currentStatus: 'applied', targetStatus: 'interview' };
    const steps = collectToolSteps(
      message([dynamicPart('recordApplicationStatus', 'output-available', { output })]),
    );
    expect(steps).toHaveLength(0);
  });

  it('recordApplicationStatus 确认态（phase 非 preview）→ completed 步骤卡', () => {
    const output = { ok: true, phase: 'interview', jobOpportunityId: 'j1', status: 'interview' };
    const steps = collectToolSteps(
      message([dynamicPart('recordApplicationStatus', 'output-available', { output })]),
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ toolName: 'recordApplicationStatus', state: 'completed' });
  });

  it('recordApplicationStatus 预览失败（ok:false）→ 失败步骤卡（可重试，不走确认卡）', () => {
    const output = { ok: false, error: { code: 'NOT_APPLIED', message: '该岗位尚未投递' } };
    const steps = collectToolSteps(
      message([dynamicPart('recordApplicationStatus', 'output-available', { output })]),
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].state).toBe('failed');
    expect(steps[0].errorMessage).toBe('该岗位尚未投递');
  });

  it('SDK approval 状态（approval-requested/output-denied）→ 不渲染', () => {
    const steps = collectToolSteps(
      message([
        staticPart('matchJob', 'approval-requested', { approval: { id: 'a1', approved: undefined } }),
        staticPart('matchJob', 'output-denied', { approval: { id: 'a2', approved: false } }),
      ]),
    );
    expect(steps).toHaveLength(0);
  });

  it('非工具 part（text/step-start）忽略；无工具 part → 空列表', () => {
    expect(
      collectToolSteps(message([{ type: 'text', text: '你好' }, { type: 'step-start' }])),
    ).toEqual([]);
    expect(collectToolSteps(message([]))).toEqual([]);
  });
});

describe('extractSuccessSummary（完成态一句话摘要）', () => {
  it('list 工具取 count', () => {
    expect(extractSuccessSummary('listResumes', { ok: true, count: 3 })).toBe('共 3 份简历');
    expect(extractSuccessSummary('listJobOpportunities', { ok: true, count: 5 })).toBe('共 5 个岗位');
  });

  it('分析/匹配取评分', () => {
    expect(extractSuccessSummary('analyzeResume', { ok: true, overallScore: 85 })).toBe('综合评分 85');
    expect(extractSuccessSummary('matchJob', { ok: true, overallScore: 72 })).toBe('匹配分 72');
  });

  it('渠道发现取渠道数', () => {
    expect(extractSuccessSummary('discoverChannels', { ok: true, channelsCount: 2 })).toBe('发现 2 个渠道');
  });

  it('导入简历取名称', () => {
    expect(extractSuccessSummary('importResume', { ok: true, name: '我的简历' })).toBe('已导入「我的简历」');
  });

  it('applyJob：preview 与确认态摘要区分', () => {
    expect(extractSuccessSummary('applyJob', { ok: true, phase: 'preview' })).toBe('已生成投递摘要');
    expect(extractSuccessSummary('applyJob', { ok: true, phase: 'applying', status: 'applying' })).toBe(
      '已推进为投递中',
    );
  });

  it('recordApplicationStatus 确认态映射中文', () => {
    expect(extractSuccessSummary('recordApplicationStatus', { ok: true, status: 'interview' })).toBe(
      '已记录为面试',
    );
    expect(extractSuccessSummary('recordApplicationStatus', { ok: true, status: 'hired' })).toBe(
      '已记录为已入职',
    );
  });

  it('planUpdate 取当前步骤标题', () => {
    expect(
      extractSuccessSummary('planUpdate', {
        ok: true,
        planSummary: { currentStepTitle: '生成求职周报' },
      }),
    ).toBe('已推进至「生成求职周报」');
  });

  it('无关键字段或未知工具 → null（调用方兜底「完成」）', () => {
    expect(extractSuccessSummary('listResumes', { ok: true })).toBeNull();
    expect(extractSuccessSummary('unknownTool', { ok: true, count: 1 })).toBeNull();
    expect(extractSuccessSummary('matchJob', 'not-an-object')).toBeNull();
    expect(extractSuccessSummary('matchJob', null)).toBeNull();
  });
});

describe('extractSuccessDetails（完成态输出要点）', () => {
  it('只留顶层标量字段，排除大字段与嵌套对象', () => {
    const lines = extractSuccessDetails('matchJob', {
      ok: true,
      jobOpportunityId: 'j1',
      overallScore: 72,
      hint: '已保存',
      preview: '长文本',
      summary: { requirementsCount: 5 },
      channels: [],
    });
    const keys = lines.map((l) => l.key);
    expect(keys).toContain('岗位');
    expect(keys).toContain('综合评分');
    expect(keys).not.toContain('ok');
    expect(keys).not.toContain('hint');
    expect(keys).not.toContain('preview');
    expect(keys).not.toContain('summary');
    expect(keys).not.toContain('channels');
  });

  it('status 值映射中文标签', () => {
    const lines = extractSuccessDetails('applyJob', { ok: true, status: 'applied' });
    expect(lines.find((l) => l.key === '状态')?.value).toBe('已投递');
  });

  it('长值截断到 40 字符', () => {
    const long = 'x'.repeat(60);
    const lines = extractSuccessDetails('importResume', { ok: true, name: long });
    expect(lines[0].value).toHaveLength(41); // 40 字符 + 省略号
    expect(lines[0].value.endsWith('…')).toBe(true);
  });

  it('非对象输出 → 空列表', () => {
    expect(extractSuccessDetails('matchJob', null)).toEqual([]);
    expect(extractSuccessDetails('matchJob', 'x')).toEqual([]);
  });
});

describe('toolLabel / buildRetryMessage', () => {
  it('已收录工具映射中文标签，未收录回退原始名', () => {
    expect(toolLabel('importResume')).toBe('导入简历');
    expect(toolLabel('matchJob')).toBe('岗位匹配');
    expect(toolLabel('unknownTool')).toBe('unknownTool');
  });

  it('重试消息包含工具中文标签', () => {
    expect(buildRetryMessage('matchJob')).toBe('请重试刚才失败的「岗位匹配」操作');
    expect(buildRetryMessage('unknownTool')).toBe('请重试刚才失败的「unknownTool」操作');
  });
});
