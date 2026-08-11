import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

let sqlite: Database.Database | null = null;

export let db: ReturnType<typeof drizzle<typeof schema>>;

/** 初始化数据库连接（默认 data/job-helper.db；评测等隔离场景传 :memory: 或临时路径）。
 * 重复调用会关闭旧连接并替换全局 db——所有 repository 经 ESM live binding 读到新连接。 */
export function initDb(path: string = 'data/job-helper.db'): void {
  // 先打开新连接再关旧连接：新连接失败（路径非法/权限不足）时旧连接保持可用
  const next = new Database(path);
  next.pragma('journal_mode = WAL');
  next.pragma('foreign_keys = ON');
  if (sqlite) sqlite.close();
  sqlite = next;
  db = drizzle(next, { schema });
}

/** 读取当前 db 实例。必须经函数而非直接导入 `db`：tsx CLI 下 src/db 以 CJS 编译，
 * Node ESM→CJS 互操作对 `export let` 重绑定不实时（导入方拿到快照），函数绑定则实时。 */
export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  return db;
}

// 模块加载即建立默认连接，保持「不调 initDb 也直连 dev 库」的既有行为
initDb();

export { schema };
