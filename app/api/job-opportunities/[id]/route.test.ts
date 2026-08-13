import { describe, expect, it } from 'vitest';
import { createJobOpportunity, deleteJobOpportunity, getJobOpportunity } from '@/src/db/repositories/job-opportunities';
import { PATCH } from './route';

function patchReq(body: unknown): Request {
  return new Request('http://localhost/api/job-opportunities/x', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/job-opportunities/[id]', () => {
  it('资源不存在返回 404 语义化错误', async () => {
    const res = await PATCH(patchReq({ title: '前端工程师' }), { params: Promise.resolve({ id: 'nonexistent-id' }) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: 'JOB_OPPORTUNITY_NOT_FOUND', message: '岗位不存在' });
  });

  it('title 缺失返回 400', async () => {
    // 先建真实记录：get-first 404 检查要求资源存在，才能验证 400 分支（测后即删，不污染 dev 库）
    const created = createJobOpportunity('test-rename-占位');
    try {
      const res = await PATCH(patchReq({}), { params: Promise.resolve({ id: created.id }) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('INVALID_REQUEST');
    } finally {
      deleteJobOpportunity(created.id);
    }
  });

  it('多余字段（company）被拒绝：strictObject 不允许', async () => {
    const created = createJobOpportunity('test-rename-占位');
    try {
      const res = await PATCH(patchReq({ title: '前端工程师', company: '不该出现' }), { params: Promise.resolve({ id: created.id }) });
      expect(res.status).toBe(400);
      // 文案区分：多余字段提示「只允许修改岗位名」而非「岗位名不能为空」
      expect((await res.json()).message).toBe('只允许修改岗位名');
    } finally {
      deleteJobOpportunity(created.id);
    }
  });

  it('合法 title 更新成功：返回 ok:true 且 title 已更新、company 不变', async () => {
    const created = createJobOpportunity('test-rename-占位');
    try {
      const res = await PATCH(patchReq({ title: 'test-rename-新岗位名' }), { params: Promise.resolve({ id: created.id }) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      const updated = getJobOpportunity(created.id);
      expect(updated?.title).toBe('test-rename-新岗位名');
      expect(updated?.company).toBe(created.company);
    } finally {
      deleteJobOpportunity(created.id);
    }
  });
});
