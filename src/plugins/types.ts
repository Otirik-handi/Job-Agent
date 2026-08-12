/** 插件化外部采集后端（OpenCLI 等）。web-fetch-router 的降级链 opencli 层经注册表调用。 */
export type PluginFetchOutcome =
  | { ok: true; title: string; content: string; citations: string[] }
  | { ok: false; code: 'NEEDS_LOGIN' | 'BLOCKED' | 'FAILED'; message: string; hint: string };

export interface FetchBackendPlugin {
  id: string;
  name: string;
  /** 可用性检查（doctor，进程内缓存）——不可用时降级链跳过该层 */
  isAvailable(): boolean;
  /** 域名/路径判断：该插件能否处理此 URL */
  canHandle(url: string): boolean;
  /** 结构化采集 */
  fetch(url: string): Promise<PluginFetchOutcome>;
}
