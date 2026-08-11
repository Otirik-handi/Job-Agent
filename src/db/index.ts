import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

let sqlite: Database.Database | null = null;

export let db: ReturnType<typeof drizzle<typeof schema>>;

/** 初始化数据库连接（默认 data/job-helper.db；评测等隔离场景传 :memory: 或临时路径）。
 * 重复调用会关闭旧连接并替换全局 db——所有 repository 经 ESM live binding 读到新连接。 */
export function initDb(path: string = 'data/job-helper.db'): void {
  if (sqlite) sqlite.close();
  const next = new Database(path);
  next.pragma('journal_mode = WAL');
  next.pragma('foreign_keys = ON');
  sqlite = next;
  db = drizzle(next, { schema });
}

// 模块加载即建立默认连接，保持「不调 initDb 也直连 dev 库」的既有行为
initDb();

export { schema };
