import type { Config } from "drizzle-kit";
import path from "path";

// 数据库路径：优先用 /data 目录（Zeabur 持久化挂载点），否则用本地
const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "app.db");

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
} satisfies Config;
