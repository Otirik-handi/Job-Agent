import { describe, expect, it, vi, beforeEach } from 'vitest';
import { applyJobTool } from './apply-job';
import type { ToolContext } from '../tool-factory';

vi.mock('../../db/repositories/job-opportunities', () => ({
  getJobOpportunity: vi.fn(),
  updateJobApplication: vi.fn(),
}));
vi.mock('../../db/repositories/status-history', () => ({
  recordStatusTransition: vi.fn(),
}));

import { getJobOpportunity, updateJobApplication } from '../../db/repositories/job-opportunities';
import { recordStatusTransition } from '../../db/repositories/status-history';

const mockGet = vi.mocked(getJobOpportunity);
const mockUpdate = vi.mocked(updateJobApplication);
const mockRecord = vi.mocked(recordStatusTransition);

const noopCtx = {
  callStructured: vi.fn(),
  log: vi.fn(),
} as unknown as ToolContext;

function jobWith(status: string, fitResultJson: string | null = '{}') {
  return {
    id: 'j1', company: '示例公司', title: '前端工程师', jdText: 'JD 文本', url: null,
    status, fitResultJson, channelsJson: null, interviewPrepJson: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockUpdate.mockReset();
  mockRecord.mockReset();
});

describe('applyJob 业务失败返回结构化错误对象（不抛异常）', () => {
  it('岗位不存在 → JOB_NOT_FOUND（含 hint 下一步）', async () => {
    mockGet.mockReturnValue(null);
    const result = await applyJobTool.execute({ jobOpportunityId: 'missing', action: 'apply' }, { toolCallId: 'test', messages: [], context: noopCtx });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'JOB_NOT_FOUND',
        message: expect.any(String),
        hint: expect.stringContaining('importJobOpportunity'),
      },
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('未匹配岗位 apply → JOB_MATCH_REQUIRED（hint 指向 matchJob）', async () => {
    mockGet.mockReturnValue(jobWith('saved', null));
    const result = await applyJobTool.execute({ jobOpportunityId: 'j1', action: 'apply' }, { toolCallId: 'test', messages: [], context: noopCtx });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'JOB_MATCH_REQUIRED', hint: expect.stringContaining('matchJob') },
      jobOpportunityId: 'j1',
      currentStatus: 'saved',
    });
  });

  it('终态岗位再投递 → STATUS_TRANSITION_INVALID（hint 说明终态）', async () => {
    mockGet.mockReturnValue(jobWith('applied'));
    const result = await applyJobTool.execute({ jobOpportunityId: 'j1', action: 'apply' }, { toolCallId: 'test', messages: [], context: noopCtx });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'STATUS_TRANSITION_INVALID', hint: expect.stringContaining('终态') },
    });
  });
});

describe('applyJob 第一段预览（无 confirmed 不落库）', () => {
  it('matched + apply → ok:true phase:preview，不调用落库', async () => {
    mockGet.mockReturnValue(jobWith('matched'));
    const result = await applyJobTool.execute({ jobOpportunityId: 'j1', action: 'apply' }, { toolCallId: 'test', messages: [], context: noopCtx });
    expect(result).toMatchObject({ ok: true, phase: 'preview', targetStatus: 'applying' });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
