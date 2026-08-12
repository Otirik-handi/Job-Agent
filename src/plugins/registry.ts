/** 插件静态注册表（本地单应用，无动态扫描；未来插件在模块加载时注册）。 */
import type { FetchBackendPlugin } from './types';

const plugins = new Map<string, FetchBackendPlugin>();

export function registerPlugin(plugin: FetchBackendPlugin): void {
  plugins.set(plugin.id, plugin);
}

export function getPlugin(id: string): FetchBackendPlugin | undefined {
  return plugins.get(id);
}

export function listPlugins(): FetchBackendPlugin[] {
  return [...plugins.values()];
}

/** 清空注册表（测试专用：防模块级 Map 跨用例污染） */
export function clearPlugins(): void {
  plugins.clear();
}
