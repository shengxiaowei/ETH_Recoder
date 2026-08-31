/**
 * API Route：蒙特卡洛模拟
 * POST /api/simulate
 */

import { NextRequest, NextResponse } from "next/server";
import { queryCandlesticks, queryFundingRates, fullSync } from "@/lib/sync";
import { runSimulation } from "@/engine/simulate";
import type { GridConfig, GridDirection, GridMode } from "@/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      contract,
      interval,
      simulateDays,
      simulationCount,
      model,
      grid,
    } = body;

    if (!contract || !interval || !grid) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 确保数据已同步
    try {
      await fullSync(contract);
    } catch (e) {
      console.warn("[simulate] 同步失败", e);
    }

    // 取历史数据用于拟合分布（最多 1 年）
    const now = Math.floor(Date.now() / 1000);
    const from = now - 365 * 86400;

    const candles = await queryCandlesticks(contract, interval as any, from, now);
    if (candles.length < 30) {
      return NextResponse.json(
        { error: "历史数据太少，需要至少 30 条 K 线" },
        { status: 400 }
      );
    }

    const fundingRates = await queryFundingRates(contract, from, now);

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

    const result = runSimulation({
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
      simulationCount: Number(simulationCount) || 200,
      simulateDays: Number(simulateDays) || 30,
      model: model || "bootstrap",
    });

    // 返回时简化：不要每条路径的完整 K 线（太大）
    return NextResponse.json({
      summary: {
        liquidationRate: result.liquidationRate,
        expectedReturnPct: result.expectedReturnPct,
        medianReturnPct: result.medianReturnPct,
        var95: result.var95,
        cvar95: result.cvar95,
        percentileP5: result.percentileP5,
        percentileP25: result.percentileP25,
        percentileP75: result.percentileP75,
        percentileP95: result.percentileP95,
      },
      paths: result.paths.map((p) => ({
        pathIndex: p.pathIndex,
        returnPct: p.returnPct,
        liquidated: p.liquidated,
      })),
    });
  } catch (err) {
    console.error("[simulate] 错误", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
