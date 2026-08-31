import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import fs from "fs";

/**
 * 获取数据库路径
 * 优先使用环境变量（Zeabur 挂载到 /data 目录），否则用本地 data/ 目录
 */
function getDbPath(): string {
  // Zeabur 会把持久化目录挂载到 /data
  const zeaburDataDir = "/data";
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }
  if (fs.existsSync(zeaburDataDir)) {
    return path.join(zeaburDataDir, "app.db");
  }
  // 本地开发
  const localDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  return path.join(localDir, "app.db");
}

// 单例模式：确保全局只开一个数据库连接
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;

  const dbPath = getDbPath();
  console.log(`[DB] 连接 SQLite: ${dbPath}`);

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  _db = drizzle(sqlite);
  return _db;
}

// 导出原始连接（用于需要原生 SQL 的场景）
export function getRawDb() {
  const dbPath = getDbPath();
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  return sqlite;
}
