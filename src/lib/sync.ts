/**
 * 数据同步服务
 * 从 Gate.io 拉取 K 线和资金费率数据，存入 SQLite
 * 支持增量同步（只拉缺失的数据）
 */

import { eq, desc, sql, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { candlesticks, fundingRates, contractInfo, syncStatus } from "@/db/schema";
import {
  fetchCandlesticks,
  fetchFundingRates,
  fetchContractInfo,
  intervalToSeconds,
  GateInterval,
} from "./gateio";

export const SUPPORTED_CONTRACTS = ["ETH_USDT", "BTC_USDT"] as const;
export const SUPPORTED_INTERVALS: GateInterval[] = ["1h", "4h", "1d"];

/**
 * 同步 K 线数据（增量）
 */
export async function syncCandlesticks(
  contract: string,
  interval: GateInterval
): Promise<{ pulled: number; from: number; to: number }> {
  const db = getDb();
  const seconds = intervalToSeconds(interval);
  const now = Math.floor(Date.now() / 1000);

  // 查当前 DB 里最新的 K 线时间
  const latest = await db
    .select({ openTime: candlesticks.openTime })
    .from(candlesticks)
    .where(and(eq(candlesticks.contract, contract), eq(candlesticks.interval, interval)))
    .orderBy(desc(candlesticks.openTime))
    .limit(1);

  let from: number;
  if (latest.length === 0) {
    from = now - 365 * 86400;
    console.log(`[sync] ${contract} ${interval} 空表，从 ${new Date(from * 1000).toISOString()} 开始拉`);
  } else {
    from = latest[0].openTime + seconds;
  }

  // Gate.io 限制 from 离现在最多 180 天
  const MAX_LOOKBACK = 170 * 86400;
  const earliestAllowed = now - MAX_LOOKBACK;
  let actualFrom = Math.max(from, earliestAllowed);
  if (actualFrom !== from) {
    console.log(`[sync] from 超出 Gate.io 限制，调整到 ${new Date(actualFrom * 1000).toISOString()}`);
  }

  // Gate.io 限制 from 离现在最多 180 天，需要分页拉
  const GATE_MAX_RANGE = 170 * 86400; // 留一点余量
  const allCandles: Awaited<ReturnType<typeof fetchCandlesticks>> = [];

  let cursorFrom = actualFrom;
  while (cursorFrom < now) {
    const cursorTo = Math.min(cursorFrom + GATE_MAX_RANGE, now);
    console.log(`[sync] 分页拉 ${new Date(cursorFrom * 1000).toISOString()} ~ ${new Date(cursorTo * 1000).toISOString()}`);

    const batch = await fetchCandlesticks({
      contract,
      interval,
      from: cursorFrom,
      to: cursorTo,
    });
    allCandles.push(...batch);
    cursorFrom = cursorTo + 1;

    // 限速保护
    await new Promise((r) => setTimeout(r, 300));
  }

  if (allCandles.length === 0) {
    console.log(`[sync] ${contract} ${interval} 无新数据`);
    return { pulled: 0, from, to: now };
  }

  // 去重 + 排序（因为分页可能有重叠）
  const uniqueMap = new Map<number, typeof allCandles[number]>();
  for (const c of allCandles) uniqueMap.set(c.openTime, c);
  const candles = Array.from(uniqueMap.values()).sort((a, b) => a.openTime - b.openTime);

  const insertStmt = db.insert(candlesticks);
  let pulled = 0;
  for (const c of candles) {
    try {
      await insertStmt
        .values({
          contract,
          interval,
          openTime: c.openTime,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          closeTime: c.closeTime,
        })
        .onConflictDoNothing();
      pulled++;
    } catch {
      // ignore duplicates
    }
  }

  await db
    .insert(syncStatus)
    .values({
      contract,
      interval,
      syncedUntil: candles[candles.length - 1].openTime,
      lastSyncAt: now,
    })
    .onConflictDoUpdate({
      target: [syncStatus.contract, syncStatus.interval],
      set: {
        syncedUntil: candles[candles.length - 1].openTime,
        lastSyncAt: now,
      },
    });

  console.log(
    `[sync] ${contract} ${interval} 拉取 ${pulled} 条，到 ${new Date(
      candles[candles.length - 1].openTime * 1000
    ).toISOString()}`
  );

  return { pulled, from, to: candles[candles.length - 1].openTime };
}

/**
 * 同步资金费率（增量）
 */
export async function syncFundingRates(contract: string): Promise<{ pulled: number }> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const latest = await db
    .select({ settleTime: fundingRates.settleTime })
    .from(fundingRates)
    .where(eq(fundingRates.contract, contract))
    .orderBy(desc(fundingRates.settleTime))
    .limit(1);

  let from = latest.length === 0 ? now - 365 * 86400 : latest[0].settleTime + 1;

  // Gate.io 同样限制 from 最多 180 天
  const MAX_LOOKBACK = 170 * 86400;
  from = Math.max(from, now - MAX_LOOKBACK);

  const rates = await fetchFundingRates({ contract, from, to: now });

  if (rates.length === 0) {
    console.log(`[sync] ${contract} funding 无新数据`);
    return { pulled: 0 };
  }

  let pulled = 0;
  for (const r of rates) {
    try {
      await db
        .insert(fundingRates)
        .values({
          contract,
          settleTime: r.settleTime,
          fundingRate: r.fundingRate,
        })
        .onConflictDoNothing();
      pulled++;
    } catch {
      // ignore
    }
  }

  await db
    .insert(syncStatus)
    .values({
      contract,
      interval: "funding",
      syncedUntil: rates[rates.length - 1].settleTime,
      lastSyncAt: now,
    })
    .onConflictDoUpdate({
      target: [syncStatus.contract, syncStatus.interval],
      set: {
        syncedUntil: rates[rates.length - 1].settleTime,
        lastSyncAt: now,
      },
    });

  console.log(`[sync] ${contract} funding 拉取 ${pulled} 条`);
  return { pulled };
}

export async function syncContractInfo(contract: string): Promise<void> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const info = await fetchContractInfo(contract);
  await db
    .insert(contractInfo)
    .values({
      contract,
      quantoMultiplier: parseFloat(info.quanto_multiplier),
      tickSize: parseFloat((info as any).order_price_round || "0.01"),
      leverageMax: info.leverage_max,
      makerRate: parseFloat((info as any).maker_fee_rate || "0.0002"),
      takerRate: parseFloat((info as any).taker_fee_rate || "0.0005"),
      lastUpdated: now,
    })
    .onConflictDoUpdate({
      target: contractInfo.contract,
      set: { lastUpdated: now },
    });
}

export async function fullSync(contract: string): Promise<void> {
  console.log(`[sync] ===== 开始全量同步 ${contract} =====`);
  await syncContractInfo(contract);
  for (const interval of SUPPORTED_INTERVALS) {
    await syncCandlesticks(contract, interval);
    await new Promise((r) => setTimeout(r, 200));
  }
  await syncFundingRates(contract);
  console.log(`[sync] ===== ${contract} 全量同步完成 =====`);
}

export async function incrementalSyncAll(): Promise<void> {
  for (const contract of SUPPORTED_CONTRACTS) {
    await fullSync(contract);
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function getSyncStatus() {
  const db = getDb();
  return db.select().from(syncStatus).orderBy(desc(syncStatus.lastSyncAt));
}

export async function queryCandlesticks(
  contract: string,
  interval: GateInterval,
  from?: number,
  to?: number
) {
  const db = getDb();
  const conditions: any[] = [
    eq(candlesticks.contract, contract),
    eq(candlesticks.interval, interval),
  ];
  if (from !== undefined) {
    conditions.push(sql`${candlesticks.openTime} >= ${from}`);
  }
  if (to !== undefined) {
    conditions.push(sql`${candlesticks.openTime} <= ${to}`);
  }
  return db
    .select()
    .from(candlesticks)
    .where(and(...conditions))
    .orderBy(candlesticks.openTime);
}

export async function queryFundingRates(contract: string, from?: number, to?: number) {
  const db = getDb();
  const conditions: any[] = [eq(fundingRates.contract, contract)];
  if (from !== undefined) conditions.push(sql`${fundingRates.settleTime} >= ${from}`);
  if (to !== undefined) conditions.push(sql`${fundingRates.settleTime} <= ${to}`);
  return db
    .select()
    .from(fundingRates)
    .where(and(...conditions))
    .orderBy(fundingRates.settleTime);
}
