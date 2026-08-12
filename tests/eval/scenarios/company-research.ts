import { expect } from 'vitest';
import type { Scenario } from './types';
import { addTrustedUrls } from '../../../src/agent/tools/web-fetch';
import { isMockLayer, stubWebNetwork } from '../web-network-stub';

/** mock 层 fetch 实现：按调用顺序返回 Tavily 搜索响应 → 目标页 HTML（web 工具链不真调外网） */
let fetchCount = 0;
const mockFetch = async (): Promise<Response> => {
  fetchCount += 1;
  if (fetchCount === 1) {
    // Tavily 搜索响应：命中目标页（URL 由 webSearch 工具自动加入可信集合）
    return new Response(
      JSON.stringify({
        results: [{ title: '字节跳动招聘官网', url: 'https://jobs.bytedance.com/', content: '字节跳动招聘前端工程师' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }
  // 目标页 HTML（direct 抓取）
  return new Response('<h1>字节跳动招聘</h1><p>薪资范围 30-60k，要求 3 年以上经验</p>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
};

export const companyResearchScenario: Scenario = {
  id: 'company-research',
  family: 'high-frequency',
  description: '调研公司：webSearch → webFetch → 总结（web 工具链端到端）',
  setup: () => {
    // 预注册场景脚本用到的可信 URL（真实用户场景由 webSearch 结果/消息提取注册）
    addTrustedUrls(['https://jobs.bytedance.com/']);
    // 网络隔离（仅 mock 层）：stub 全局 fetch 拦截 web 工具真实请求；真实层（CLI）不劫持网络
    if (isMockLayer()) {
      fetchCount = 0;
      stubWebNetwork(mockFetch);
    }
  },
  userMessages: ['帮我调研一下字节跳动的招聘情况'],
  mockScript: [
    { type: 'tool-call', toolName: 'webSearch', input: { query: '字节跳动 招聘 前端' } },
    { type: 'tool-call', toolName: 'webFetch', input: { url: 'https://jobs.bytedance.com/' } },
    { type: 'text', text: '调研完成：字节跳动招聘前端工程师，薪资范围 30-60k，要求 3 年以上经验。' },
  ],
  assertFinalState: (ctx) => {
    expect(ctx.allAssistantText()).toContain('字节跳动');
    expect(ctx.allAssistantText()).toContain('招聘');
  },
};
