import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createDomainTool, ToolExecutionError, type ToolContext } from './tool-factory';

const noopCtx = {
  callStructured: vi.fn(),
  log: vi.fn(),
} as unknown as ToolContext;

function makeTool(execute: () => Promise<unknown>) {
  return createDomainTool({
    name: 'testTool',
    description: '测试工具',
    inputSchema: z.object({}),
    progress: { start: '开始', done: '完成' },
    execute,
  });
}

describe('createDomainTool 错误透传与兜底', () => {
  it('透传工具抛出的结构化错误：code/message/hint 三字段保持', async () => {
    const tool = makeTool(async () => {
      throw new ToolExecutionError({
        code: 'JOB_MATCH_REQUIRED',
        message: '该岗位尚未完成匹配，无法投递',
        hint: '请先调用 matchJob 完成岗位匹配，再执行投递。',
      });
    });
    const result = await tool.execute({}, { toolCallId: 'test', messages: [], context: noopCtx });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'JOB_MATCH_REQUIRED',
        message: '该岗位尚未完成匹配，无法投递',
        hint: '请先调用 matchJob 完成岗位匹配，再执行投递。',
      },
    });
  });

  it('未知异常兜底为 TOOL_FAILED（保留原始 message）', async () => {
    const tool = makeTool(async () => {
      throw new Error('boom: 数据库连接失败');
    });
    const result = await tool.execute({}, { toolCallId: 'test', messages: [], context: noopCtx });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'TOOL_FAILED',
        message: 'boom: 数据库连接失败',
        hint: expect.stringContaining('重试'),
      },
    });
  });

  it('非 Error 抛出的未知异常同样兜底为 TOOL_FAILED', async () => {
    const tool = makeTool(async () => {
      throw 'some-string-error';
    });
    const result = await tool.execute({}, { toolCallId: 'test', messages: [], context: noopCtx });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'TOOL_FAILED',
        message: 'some-string-error',
        hint: expect.any(String),
      },
    });
  });

  it('成功结果原样透传（不包错误壳）', async () => {
    const tool = makeTool(async () => ({ ok: true, count: 3 }));
    const result = await tool.execute({}, { toolCallId: 'test', messages: [], context: noopCtx });
    expect(result).toEqual({ ok: true, count: 3 });
  });
});

describe('ToolExecutionError', () => {
  it('toResult 产出 { ok:false, error } 且三字段齐备', () => {
    const err = new ToolExecutionError({
      code: 'NOT_APPLIED',
      message: '该岗位尚未投递，无法记录投递后状态',
      hint: '请先调用 applyJob 完成投递，再记录投递后状态。',
    });
    expect(err.code).toBe('NOT_APPLIED');
    expect(err.message).toBe('该岗位尚未投递，无法记录投递后状态');
    expect(err.toResult()).toEqual({
      ok: false,
      error: {
        code: 'NOT_APPLIED',
        message: '该岗位尚未投递，无法记录投递后状态',
        hint: '请先调用 applyJob 完成投递，再记录投递后状态。',
      },
    });
  });
});
