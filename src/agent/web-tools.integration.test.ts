/** web 工具全链路集成测试：mock 全局 fetch，验证 webSearch → webFetch → 总结 一轮跑通（不依赖外网） */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { initDb, db } from '../db';
import { runAgentTurn } from './run-agent';
import { createScriptedModel } from '../../tests/eval/mock-model';
import { createConversation } from '../db/repositories/conversations';
import { addTrustedUrls, resetWebQuota } from './tools/web-fetch';

function userMsg(text: string, index: number) {
  return { id: `it-${index}`, role: 'user' as const, parts: [{ type: 'text' as const, text }] };
}

beforeEach(() => {
  initDb(':memory:');
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  resetWebQuota();
  // 固定走 Brave 供应商：清掉其他 key，避免本机环境变量改变 mock 响应形状；
  // 同时清掉 embedding 配置，保证消息嵌入不发起真实请求（与 mock fetch 争抢响应）
  delete process.env.TAVILY_API_KEY;
  delete process.env.ZHIPU_API_KEY;
  delete process.env.EMBEDDING_BASE_URL;
  delete process.env.EMBEDDING_API_KEY;
  delete process.env.EMBEDDING_MODEL;
});

afterEach(() => {
  initDb();
  delete process.env.BRAVE_API_KEY;
  vi.unstubAllGlobals();
});

describe('web 工具全链路（mock fetch）', () => {
  it('webSearch → webFetch → 总结 一轮跑通（可信集合自动流转）', async () => {
    const conv = createConversation('web 集成');
    // Brave 搜索 → 智联详情 direct 抓取
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ web: { results: [{ title: '某公司招聘', url: 'https://www.zhaopin.com/jobdetail/1.htm', description: 'JD 摘要' }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response('<h1>公司岗位</h1><p>要求：本科，5 年经验</p>', { status: 200, headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    process.env.BRAVE_API_KEY = 'test-key';
    addTrustedUrls(['https://www.zhaopin.com/jobdetail/1.htm']);
    const model = createScriptedModel([
      { type: 'tool-call', toolName: 'webSearch', input: { query: '某公司 招聘 前端' } },
      { type: 'tool-call', toolName: 'webFetch', input: { url: 'https://www.zhaopin.com/jobdetail/1.htm' } },
      { type: 'text', text: '已调研：该公司招聘前端工程师，要求本科与 5 年经验。' },
    ]);
    const result = await runAgentTurn({ conversationId: conv.id, messages: [userMsg('帮我调研某公司的招聘情况', 0)], model });
    const text = result.messages.map((m) => JSON.stringify(m.parts)).join('');
    expect(text).toContain('已调研');
    expect(text).toContain('本科');
  });
});
