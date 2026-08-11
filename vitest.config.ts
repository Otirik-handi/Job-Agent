import { defineConfig } from 'vitest/config';
import path from 'node:path';

// 解析 tsconfig 的 `@/*` 路径别名（vite 默认不读 tsconfig paths）；
// vitest 从项目根目录启动，process.cwd() 即项目根
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(process.cwd()),
    },
  },
  test: {
    // initDb 是全局连接切换（ESM live binding 替换 db）：文件并行会让评测临时库
    // （:memory:）与直连 dev 库的测试互相污染；同时串行也避免共享 SQLite 文件
    // 并发写入触发 better-sqlite3「database is locked」
    fileParallelism: false,
  },
});
