import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/skills（列表投影）', () => {
  it('返回技能元数据列表，字段仅 name/description', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.skills)).toBe(true);
    expect(body.skills.length).toBeGreaterThanOrEqual(10);
    // 已知技能存在（仓库固定包含）
    expect(body.skills.some((s: { name: string }) => s.name === 'jd-analysis')).toBe(true);
    const first = body.skills[0];
    expect(Object.keys(first).sort()).toEqual(['description', 'name']);
    // 正文大字段不进列表投影
    expect('content' in first).toBe(false);
  });
});
