/** mock 层评测网络隔离：stub 全局 fetch + 注入搜索供应商 key，让 web 工具链在 mock 层不真调外网。
 * 仅 mock 层（vitest，process.env.VITEST=true）场景使用——CLI 真实层的模型/搜索请求也走全局
 * fetch，劫持会破坏真实层，故以 isMockLayer() 判定。runner finally 统一恢复（未 stub 时为空操作，
 * CLI 下无副作用）。不依赖 vi（vitest 的 stubEnv 在非测试环境会抛错，CLI 不可用）。 */

let stubbed = false;
let originalFetch: typeof globalThis.fetch = globalThis.fetch;
let originalTavilyKey: string | undefined;
let hadTavilyKey = false;

/** mock 层判定：vitest 测试进程恒置 VITEST=true；CLI（真实层）未设置 */
export function isMockLayer(): boolean {
  return process.env.VITEST === 'true';
}

/** 场景 setup 调用：替换全局 fetch 并注入 TAVILY_API_KEY（供应商探测需要 key 存在才走真实链路）。幂等。 */
export function stubWebNetwork(mockFetch: typeof globalThis.fetch): void {
  if (stubbed) return;
  originalFetch = globalThis.fetch;
  hadTavilyKey = 'TAVILY_API_KEY' in process.env;
  originalTavilyKey = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = 'eval-mock-key';
  globalThis.fetch = mockFetch;
  stubbed = true;
}

/** runner finally 调用：恢复 fetch 与环境变量（未 stub 时无副作用） */
export function restoreWebNetwork(): void {
  if (!stubbed) return;
  globalThis.fetch = originalFetch;
  if (hadTavilyKey) process.env.TAVILY_API_KEY = originalTavilyKey;
  else delete process.env.TAVILY_API_KEY;
  stubbed = false;
}
