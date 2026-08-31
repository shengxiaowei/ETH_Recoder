/**
 * API Route：回测引擎
 * POST /api/backtest
 * 
 * 请求体：
 * {
 *   contract: 'ETH_USDT',
 *   interval: '4h',
 *   from: 1725000000,
 *   to: 1728000000,
 *   grid: { ... GridConfig }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { queryCandlesticks, queryFundingRates, fullSync } from "@/lib/sync";
import { runBacktest } from "@/engine/grid";
import type { GridConfig, GridDirection, GridMode } from "@/engine/types";

export const runtime = "nodejs"; // 需要 Node.js runtime（better-sqlite3 不支持 edge）
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contract, interval, from, to, grid } = body;

    if (!contract || !interval || !grid) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 先触发数据同步（如果需要的话）
    try {
      await fullSync(contract);
    } catch (e) {
      console.warn("[backtest] 同步失败，尝试用现有数据", e);
    }

    // 从 DB 查 K 线
    const candles = await queryCandlesticks(contract, interval as any, from, to);
    if (candles.length === 0) {
      return NextResponse.json(
        { error: `数据库中没有 ${contract} ${interval} 的 K 线数据，请先同步` },
        { status: 400 }
      );
    }

    // 查资金费率
    const fundingRates = await queryFundingRates(
      contract,
      candles[0].openTime,
      candles[candles.length - 1].openTime
    );

    // 构造 GridConfig
    const gridConfig: GridConfig = {
      direction: (grid.direction as GridDirection) || "long",
      mode: (grid.mode as GridMode) || "arithmetic",
      priceMin: Number(grid.priceMin),
      priceMax: Number(grid.priceMax),
      gridCount: Number(grid.gridCount),
      leverage: Number(grid.leverage) || 10,
      totalMargin: Number(grid.totalMargin),
      makerRate: Number(grid.makerRate) || 0.0002,
      takerRate: Number(grid.takerRate) || 0.0005,
      maintenanceMarginRate: Number(grid.maintenanceMarginRate) || 0.005,
    };

    // 运行回测
    const result = runBacktest({
      grid: gridConfig,
      candles: candles.map((c) => ({
        openTime: c.openTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        closeTime: c.closeTime,
      })),
      fundingRates: fundingRates.map((f) => ({
        settleTime: f.settleTime,
        fundingRate: f.fundingRate,
      })),
      contractSize: grid.contractSize || 0.0001,
    });

    return NextResponse.json({ result });
  } catch (err) {
    console.error("[backtest] 错误", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
