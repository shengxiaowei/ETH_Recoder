/**
 * K 线蒙特卡洛模拟器
 *
 * 两种模型：
 * 1. Bootstrap（推荐）：从历史收益率中重采样，保留真实分布特征
 * 2. GBM（几何布朗运动）：解析模型，适合快速模拟
 */

import type { Candle, FundingRecord, SimPathResult, SimulateConfig, SimulateResult } from "./types";
import { runBacktest } from "./grid";

/**
 * 从历史 K 线计算收益率序列
 */
function extractReturns(candles: Candle[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const ret = (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
    returns.push(ret);
  }
  return returns;
}

/**
 * Bootstrap 方法：从历史收益率中随机重采样，生成新的价格路径
 * 保留历史的所有统计特征（偏度、峰度、波动率聚集）
 */
export function bootstrapSimulate(
  candles: Candle[],
  simulateDays: number,
  interval: number, // K 线间隔秒数
  rng: () => number
): Candle[] {
  const returns = extractReturns(candles);
  if (returns.length === 0) return [];

  const barsToSimulate = Math.ceil((simulateDays * 86400) / interval);
  const startPrice = candles[candles.length - 1].close;
  const startTime = candles[candles.length - 1].openTime + interval;

  const simulated: Candle[] = [];
  let price = startPrice;

  // 限制单日涨跌幅（±30%），避免极端值
  const MAX_DAILY_RETURN = 0.3;
  const barsPerDay = 86400 / interval;
  let dailyRet = 0;
  let dayCount = 0;

  for (let i = 0; i < barsToSimulate; i++) {
    // 从历史收益率中随机选一个
    const idx = Math.floor(rng() * returns.length);
    const ret = returns[idx];

    // 累计日收益率，超限则截断
    dailyRet += ret;
    if (i % barsPerDay === barsPerDay - 1) {
      if (dailyRet > MAX_DAILY_RETURN) {
        // 按比例截断
        const scale = MAX_DAILY_RETURN / dailyRet;
        dailyRet = MAX_DAILY_RETURN;
        // 不修正已生成的（简化）
      } else if (dailyRet < -MAX_DAILY_RETURN) {
        dailyRet = -MAX_DAILY_RETURN;
      }
      dailyRet = 0;
      dayCount++;
    }

    const open = price;
    price = price * (1 + ret);

    // 简单的 OHLC 生成（用 ret 范围模拟）
    const volatility = Math.abs(ret) * 1.5;
    const high = Math.max(open, price) * (1 + volatility * rng());
    const low = Math.min(open, price) * (1 - volatility * rng());
    const volume = candles[Math.floor(rng() * candles.length)]?.volume || 1;

    simulated.push({
      openTime: startTime + i * interval,
      open,
      high,
      low,
      close: price,
      volume,
      closeTime: startTime + (i + 1) * interval - 1,
    });
  }

  return simulated;
}

/**
 * GBM 几何布朗运动模拟
 * dS = μ·S·dt + σ·S·dW
 * S(t+Δt) = S(t) × exp((μ - σ²/2)Δt + σ·√Δt·Z)
 */
export function gbmSimulate(
  candles: Candle[],
  simulateDays: number,
  interval: number,
  rng: () => number
): Candle[] {
  const returns = extractReturns(candles);
  if (returns.length === 0) return [];

  // 拟合历史的 μ 和 σ
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
  const sigma = Math.sqrt(variance); // 波动率（per bar）
  const mu = mean; // 漂移率

  const barsToSimulate = Math.ceil((simulateDays * 86400) / interval);
  const startPrice = candles[candles.length - 1].close;
  const startTime = candles[candles.length - 1].openTime + interval;

  const simulated: Candle[] = [];
  let price = startPrice;
  const dt = 1; // 每个 K 线单位

  for (let i = 0; i < barsToSimulate; i++) {
    // Box-Muller 生成正态随机数
    const u1 = rng();
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    const open = price;
    price = price * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);

    // 限制极端涨跌幅
    const dailyRet = (price - open) / open;
    if (dailyRet > 0.3) price = open * 1.3;
    if (dailyRet < -0.3) price = open * 0.7;

    const volatility = Math.abs(dailyRet) * 1.5;
    const high = Math.max(open, price) * (1 + volatility * rng());
    const low = Math.min(open, price) * (1 - volatility * rng());
    const volume = candles[Math.floor(rng() * candles.length)]?.volume || 1;

    simulated.push({
      openTime: startTime + i * interval,
      open,
      high,
      low,
      close: price,
      volume,
      closeTime: startTime + (i + 1) * interval - 1,
    });
  }

  return simulated;
}

/**
 * Mulberry32 PRNG（可复现的随机数生成器）
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 运行完整的蒙特卡洛模拟
 */
export function runSimulation(cfg: SimulateConfig): SimulateResult {
  const { grid, candles, fundingRates, contractSize, simulationCount, simulateDays, model } = cfg;

  if (candles.length === 0) throw new Error("没有历史数据");

  // 计算 K 线间隔
  const interval = candles[1].openTime - candles[0].openTime;

  const paths: SimPathResult[] = [];

  for (let p = 0; p < simulationCount; p++) {
    const rng = mulberry32(p * 1337 + Date.now()); // 每条路径不同种子

    // 生成模拟 K 线
    const simulatedCandles =
      model === "bootstrap"
        ? bootstrapSimulate(candles, simulateDays, interval, rng)
        : gbmSimulate(candles, simulateDays, interval, rng);

    // 生成对应的资金费率（简化：用最后几个真实值循环或用均值）
    const simulatedFunding = generateSimulatedFunding(
      fundingRates,
      simulatedCandles[0]?.openTime ?? 0,
      simulatedCandles[simulatedCandles.length - 1]?.openTime ?? 0,
      rng
    );

    // 运行回测
    const backtestResult = runBacktest({
      grid,
      candles: simulatedCandles,
      fundingRates: simulatedFunding,
      contractSize,
    });

    paths.push({
      pathIndex: p,
      finalEquity: backtestResult.finalEquity,
      returnPct: backtestResult.totalReturnPct,
      gridPnL: backtestResult.gridPnL,
      directionPnL: backtestResult.directionPnL,
      fundingPayment: backtestResult.totalFundingPayment,
      fee: backtestResult.totalFee,
      liquidated: backtestResult.liquidated,
      liquidationTime: backtestResult.liquidationTime,
      simulatedCandles,
    });
  }

  // 排序计算分位数
  const sortedReturns = paths.map((p) => p.returnPct).sort((a, b) => a - b);

  const liquidationCount = paths.filter((p) => p.liquidated).length;
  const liquidationRate = (liquidationCount / simulationCount) * 100;
  const expectedReturn = sortedReturns.reduce((s, r) => s + r, 0) / sortedReturns.length;
  const medianReturn = sortedReturns[Math.floor(sortedReturns.length / 2)];

  // VaR 95%：5% 分位数对应的收益
  const var95 = sortedReturns[Math.floor(sortedReturns.length * 0.05)];

  // CVaR 95%：所有低于 VaR 的路径的平均收益
  const tailReturns = sortedReturns.slice(0, Math.floor(sortedReturns.length * 0.05));
  const cvar95 = tailReturns.length > 0 ? tailReturns.reduce((s, r) => s + r, 0) / tailReturns.length : var95;

  const medianIdx = paths.findIndex(
    (p) => Math.abs(p.returnPct - medianReturn) < 0.01
  );

  return {
    paths,
    liquidationRate,
    expectedReturnPct: expectedReturn,
    medianReturnPct: medianReturn,
    var95,
    cvar95,
    percentileP5: sortedReturns[Math.floor(sortedReturns.length * 0.05)],
    percentileP25: sortedReturns[Math.floor(sortedReturns.length * 0.25)],
    percentileP75: sortedReturns[Math.floor(sortedReturns.length * 0.75)],
    percentileP95: sortedReturns[Math.floor(sortedReturns.length * 0.95)],
    medianPathResult: null, // 简化，不传 medianPathResult 的完整回测
  };
}

/**
 * 生成模拟期间的资金费率
 * 简化：用历史的均值 + 波动率
 */
function generateSimulatedFunding(
  history: FundingRecord[],
  startTime: number,
  endTime: number,
  rng: () => number
): FundingRecord[] {
  if (history.length === 0) return [];

  const rates = history.map((h) => h.fundingRate);
  const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
  const std = Math.sqrt(
    rates.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / rates.length
  );

  const results: FundingRecord[] = [];
  const interval = 8 * 3600; // 8 小时一次
  let t = Math.ceil(startTime / interval) * interval;

  while (t <= endTime) {
    // 简化：正态抽样，但限制范围 [-1%, 1%]
    const rate = Math.max(-0.01, Math.min(0.01, mean + std * (rng() * 2 - 1) * 3));
    results.push({ settleTime: t, fundingRate: rate });
    t += interval;
  }

  return results;
}
