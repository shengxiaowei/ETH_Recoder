import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * K 线数据表
 * 存储从 Gate.io 拉取的合约 OHLCV 数据
 */
export const candlesticks = sqliteTable(
  "candlesticks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contract: text("contract").notNull(), // 'ETH_USDT'
    interval: text("interval").notNull(), // '1h', '4h', '1d'
    openTime: integer("open_time").notNull(), // Unix timestamp (秒)
    open: real("open").notNull(),
    high: real("high").notNull(),
    low: real("low").notNull(),
    close: real("close").notNull(),
    volume: real("volume").notNull(),
    closeTime: integer("close_time").notNull(),
  },
  (table) => ({
    // 同一合约 + 粒度 + 开盘时间 = 唯一
    uniqueIdx: uniqueIndex("candlesticks_unique").on(
      table.contract,
      table.interval,
      table.openTime
    ),
  })
);

/**
 * 资金费率历史
 * Gate.io 每 8 小时结算一次
 */
export const fundingRates = sqliteTable(
  "funding_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contract: text("contract").notNull(),
    settleTime: integer("settle_time").notNull(), // 结算时刻 Unix timestamp
    fundingRate: real("funding_rate").notNull(), // 费率值（正数=多付空，负数=空付多）
  },
  (table) => ({
    uniqueIdx: uniqueIndex("funding_unique").on(table.contract, table.settleTime),
  })
);

/**
 * 合约规格信息（缓存，低频变化）
 */
export const contractInfo = sqliteTable("contract_info", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contract: text("contract").notNull().unique(),
  quantoMultiplier: real("quanto_multiplier").notNull(), // 1 张 = 多少币
  tickSize: real("tick_size").notNull(), // 最小价格变动单位
  leverageMax: integer("leverage_max").notNull(), // 最大杠杆
  makerRate: real("maker_rate").notNull(), // maker 费率
  takerRate: real("taker_rate").notNull(), // taker 费率
  lastUpdated: integer("last_updated").notNull(),
});

/**
 * 同步状态追踪（增量同步的关键）
 */
export const syncStatus = sqliteTable(
  "sync_status",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contract: text("contract").notNull(),
    interval: text("interval").notNull(), // 'candlesticks' 或 'funding'
    syncedUntil: integer("synced_until").notNull(), // 已同步到哪个时间点
    lastSyncAt: integer("last_sync_at").notNull(),
  },
  (table) => ({
    uniqueIdx: uniqueIndex("sync_unique").on(table.contract, table.interval),
  })
);

export type Candlestick = typeof candlesticks.$inferSelect;
export type FundingRate = typeof fundingRates.$inferSelect;
export type ContractInfo = typeof contractInfo.$inferSelect;
export type SyncStatus = typeof syncStatus.$inferSelect;
