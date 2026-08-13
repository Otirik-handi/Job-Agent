import { describe, expect, it } from 'vitest';
import { createResume, deleteResume, getResume } from '@/src/db/repositories/resumes';
import { PATCH } from './route';

function patchReq(body: unknown): Request {
  return new Request('http://localhost/api/resumes/x', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/resumes/[id]', () => {
  it('资源不存在返回 404 语义化错误', async () => {
    const res = await PATCH(patchReq({ name: '新名字' }), { params: Promise.resolve({ id: 'nonexistent-id' }) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: 'RESUME_NOT_FOUND', message: '简历不存在' });
  });

  it('name 缺失/为空返回 400', async () => {
    // 先建真实记录：get-first 404 检查要求资源存在，才能验证 400 分支（测后即删，不污染 dev 库）
    // 注：schema 未 trim，'  ' 是长度 2 的合法字符串；用 '' 验证「为空」被拒绝
    const created = createResume({ name: 'test-rename-占位', sourceType: 'text', sourceText: '测试内容' });
    try {
      const res = await PATCH(patchReq({ name: '' }), { params: Promise.resolve({ id: created.id }) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('INVALID_REQUEST');
    } finally {
      deleteResume(created.id);
    }
  });

  it('合法 name 更新成功：返回 ok:true 且库中 name 已更新', async () => {
    const created = createResume({ name: 'test-rename-原名', sourceType: 'text', sourceText: '测试内容' });
    try {
      const res = await PATCH(patchReq({ name: 'test-rename-新名' }), { params: Promise.resolve({ id: created.id }) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(getResume(created.id)?.name).toBe('test-rename-新名');
    } finally {
      deleteResume(created.id);
    }
  });
});
