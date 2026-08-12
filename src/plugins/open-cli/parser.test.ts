import { describe, expect, it } from 'vitest';
import { parseSiteJson, stripSecurityFields, fix51jobFields } from './parser';

describe('parseSiteJson（容错 JSON 解析）', () => {
  it('解析标准 JSON', () => {
    expect(parseSiteJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('容错：截取首个 { 到末尾 }（CLI 输出可能带前后杂讯）', () => {
    expect(parseSiteJson('prefix {"a":1} suffix')).toEqual({ a: 1 });
  });
  it('无 JSON 返回 null', () => {
    expect(parseSiteJson('nothing')).toBeNull();
  });
});

describe('stripSecurityFields（token 剥离，AGENTS.md 红线）', () => {
  it('递归删除 security_id 等字段', () => {
    const input = { job: { title: 'x', security_id: 'SECRET123' }, list: [{ securityId: 'S2', ok: 1 }] };
    const out = stripSecurityFields(input) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain('SECRET123');
    expect(JSON.stringify(out)).not.toContain('S2');
    expect((out.job as Record<string, unknown>).title).toBe('x');
    expect(((out.list as unknown[])[0] as Record<string, unknown>).ok).toBe(1);
  });
  it('非对象输入原样返回', () => {
    expect(stripSecurityFields('str' as unknown)).toBe('str');
  });
});

describe('fix51jobFields（字段错位修复：title/companyName 抓到"APP下载"）', () => {
  it('title 错位时用 category/companyIntro 交叉校验修复', () => {
    const job = { title: 'APP下载', companyName: 'APP下载', category: '高级前端工程师', companyIntro: 'XX科技' };
    const out = fix51jobFields(job);
    expect(out.title).toBe('高级前端工程师');
    expect(out.companyName).toBe('XX科技');
  });
  it('正常字段不动', () => {
    const job = { title: '前端工程师', companyName: 'XX科技', category: '高级前端工程师', companyIntro: 'XX科技' };
    expect(fix51jobFields(job)).toEqual(job);
  });
});
