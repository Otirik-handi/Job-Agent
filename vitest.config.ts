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
    // 共享同一 dev 库文件（data/job-helper.db）：并行写入会触发 better-sqlite3
    // 「database is locked」，串行执行保证确定性。initDb 切换只影响当前文件
    // （vitest 默认 isolate: true，各文件模块图独立，不跨文件泄漏）
    fileParallelism: false,
  },
});
