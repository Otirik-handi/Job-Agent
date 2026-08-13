import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/skills/[name]（详情）', () => {
  it('已知技能返回全文（含 frontmatter）', async () => {
    const res = await GET(new Request('http://localhost/api/skills/jd-analysis'), {
      params: Promise.resolve({ name: 'jd-analysis' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('jd-analysis');
    expect(typeof body.description).toBe('string');
    expect(body.content.startsWith('---')).toBe(true);
  });

  it('未知技能返回 404 语义化错误', async () => {
    const res = await GET(new Request('http://localhost/api/skills/nope'), {
      params: Promise.resolve({ name: 'nope' }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: 'SKILL_NOT_FOUND', message: '技能不存在' });
  });

  it('非法名称（路径穿越尝试）返回 404', async () => {
    const res = await GET(new Request('http://localhost/api/skills/..%2F..%2Fpackage'), {
      params: Promise.resolve({ name: '../../../package' }),
    });
    expect(res.status).toBe(404);
  });
});
