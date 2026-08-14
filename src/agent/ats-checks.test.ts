import { describe, expect, it } from 'vitest';
import { runAtsChecks } from './ats-checks';

const GOOD_RESUME = `张伟
前端开发工程师，5 年经验
技能：React、TypeScript、Node.js
工作经历：2020.06 - 2023.08 负责 XX 电商平台前端开发
教育经历：2016 年 - 2020 年 本科
邮箱 zhangwei@example.com 电话 13800138000`;

describe('runAtsChecks', () => {
  it('结构完整的简历全部通过', () => {
    const checks = runAtsChecks(GOOD_RESUME);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it('缺失教育/技能区块头时提示（标准区块头检查）', () => {
    const checks = runAtsChecks('张伟\n前端开发\n项目：做过一个商城');
    const header = checks.find((c) => c.check === '标准区块头');
    expect(header?.ok).toBe(false);
    expect(header?.issue).toContain('技能');
  });

  it('非常规区块名提示改用标准命名', () => {
    const checks = runAtsChecks('我的旅程：2020 年入职 XX 公司\n技能：React\n教育：本科');
    const named = checks.find((c) => c.check === '区块头命名');
    expect(named?.ok).toBe(false);
    expect(named?.issue).toContain('我的旅程');
  });

  it('日期格式混用（中文年月 + 数字式）提示统一', () => {
    const checks = runAtsChecks('工作经历：2023 年 6 月 - 2023.12\n技能：React\n教育：本科');
    const date = checks.find((c) => c.check === '日期格式');
    expect(date?.ok).toBe(false);
    expect(date?.issue).toContain('日期格式不统一');
  });

  it('日期范围连接符不误报（2020.06 - 2023.08 只有一种样式）', () => {
    const checks = runAtsChecks(GOOD_RESUME);
    const date = checks.find((c) => c.check === '日期格式');
    expect(date?.ok).toBe(true);
  });

  it('全角 @ 邮箱提示无法解析', () => {
    const checks = runAtsChecks('技能：React\n教育：本科\n邮箱 zhangwei＠example.com');
    const contact = checks.find((c) => c.check === '联系方式格式');
    expect(contact?.ok).toBe(false);
    expect(contact?.issue).toContain('全角');
  });

  it('多个手机号提示只保留一个', () => {
    const checks = runAtsChecks('技能：React\n教育：本科\n电话 13800138000 / 13900139000');
    const phone = checks.find((c) => c.check === '联系电话');
    expect(phone?.ok).toBe(false);
    expect(phone?.issue).toContain('2 个手机号');
  });

  it('疑似关键词堆砌提示（同一词高频重复）', () => {
    const stuffed = '技能：React\n' + Array.from({ length: 8 }, () => '精通 React 开发，React 生态，React 组件').join('\n');
    const checks = runAtsChecks(stuffed + '\n教育：本科');
    const density = checks.find((c) => c.check === '关键词密度');
    expect(density?.ok).toBe(false);
    expect(density?.issue).toContain('疑似关键词堆砌');
  });

  it('文本过短（疑似扫描件）提示', () => {
    const checks = runAtsChecks('一段极短的文本');
    const extract = checks.find((c) => c.check === '文本可提取性');
    expect(extract?.ok).toBe(false);
  });

  it('空文本不抛错且文本检查不通过', () => {
    const checks = runAtsChecks('');
    expect(checks.length).toBeGreaterThan(0);
    expect(checks[0].ok).toBe(false);
  });
});
