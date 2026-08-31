/**
 * Gate.io 合约网格策略引擎 v2
 *
 * 强平公式（Gate.io）：
 *   保证金率 = 账户权益 / 维持保证金
 *   账户权益 = 可用保证金 + 已实现盈亏 + 未实现盈亏
 *   维持保证金 = 所有持仓名义价值 × 维持保证金率
 *   保证金率 ≤ 100% → 强平
 */

import type {
  BacktestConfig,
  BacktestResult,
  GridConfig,
  GridOrder,
  Trade,
  FundingPayment,
  EquitySnapshot,
  Candle,
} from "./types";

/**
 * 持仓跟踪器 — 跟踪平均开仓价
 */
class PositionTracker {
  longAmount = 0; // 币数量
  longAvgPrice = 0;
  shortAmount = 0;
  shortAvgPrice = 0;

  openLong(amount: number, price: number) {
    const totalCost = this.longAvgPrice * this.longAmount + price * amount;
    this.longAmount += amount;
    this.longAvgPrice = this.longAmount > 0 ? totalCost / this.longAmount : 0;
  }

  closeLong(amount: number): number {
    const closed = Math.min(amount, this.longAmount);
    const pnl = (this.longAvgPrice - 0) * closed; // 占位，实际在 runBacktest 里算
    this.longAmount -= closed;
    if (this.longAmount <= 0) {
      this.longAmount = 0;
      this.longAvgPrice = 0;
    }
    return pnl;
  }

  openShort(amount: number, price: number) {
    const totalCost = this.shortAvgPrice * this.shortAmount + price * amount;
    this.shortAmount += amount;
    this.shortAvgPrice = this.shortAmount > 0 ? totalCost / this.shortAmount : 0;
  }

  closeShort(amount: number) {
    const closed = Math.min(amount, this.shortAmount);
    this.shortAmount -= closed;
    if (this.shortAmount <= 0) {
      this.shortAmount = 0;
      this.shortAvgPrice = 0;
    }
  }

  getUnrealizedPnL(currentPrice: number): number {
    const longPnL = this.longAmount > 0
      ? this.longAmount * (currentPrice - this.longAvgPrice)
      : 0;
    const shortPnL = this.shortAmount > 0
      ? this.shortAmount * (this.shortAvgPrice - currentPrice)
      : 0;
    return longPnL + shortPnL;
  }

  getLongNotional(currentPrice: number): number {
    return this.longAmount * currentPrice;
  }

  getShortNotional(currentPrice: number): number {
    return this.shortAmount * currentPrice;
  }

  reset() {
    this.longAmount = 0;
    this.longAvgPrice = 0;
    this.shortAmount = 0;
    this.shortAvgPrice = 0;
  }
}

/**
 * 根据网格配置生成挂单列表
 */
export function generateGridOrders(cfg: GridConfig): GridOrder[] {
  const { priceMin, priceMax, gridCount, mode, direction, totalMargin, leverage } = cfg;

  if (priceMin >= priceMax) throw new Error("价格下限必须小于上限");
  if (gridCount < 2) throw new Error("网格数量至少 2");

  const orders: GridOrder[] = [];
  const prices: number[] = [];

  if (mode === "arithmetic") {
    const step = (priceMax - priceMin) / gridCount;
    for (let i = 0; i <= gridCount; i++) {
      prices.push(priceMin + step * i);
    }
  } else {
    const ratio = Math.pow(priceMax / priceMin, 1 / gridCount);
    for (let i = 0; i <= gridCount; i++) {
      prices.push(priceMin * Math.pow(ratio, i));
    }
  }

  // 计算每个网格分配的保证金
  const perGridMargin = totalMargin / gridCount;
  // 每个网格能开的名义价值
  const perGridNotional = perGridMargin * leverage;
  // 每个网格固定交易的币数量（用中间价格估算）
  const midPrice = (priceMin + priceMax) / 2;
  const perGridAmount = perGridNotional / midPrice;

  let orderId = 0;

  if (direction === "long") {
    // 多头网格：低价开多(buy)，高价平多(sell)
    for (let i = 1; i < prices.length; i++) {
      const buyPrice = prices[i - 1];
      const sellPrice = prices[i];

      orders.push({
        id: orderId++,
        price: buyPrice,
        type: "buy",
        filled: false,
        filledPrice: null,
        fillTime: null,
        amount: perGridAmount,
        marginUsed: perGridMargin,
        fee: 0,
      });

      orders.push({
        id: orderId++,
        price: sellPrice,
        type: "sell",
        filled: false,
        filledPrice: null,
        fillTime: null,
        amount: perGridAmount,
        marginUsed: 0,
        fee: 0,
      });
    }
  } else if (direction === "short") {
    // 空头网格：高价开空(sell)，低价平空(buy)
    for (let i = 1; i < prices.length; i++) {
      const sellPrice = prices[i];
      const buyPrice = prices[i - 1];

      orders.push({
        id: orderId++,
        price: sellPrice,
        type: "sell",
        filled: false,
        filledPrice: null,
        fillTime: null,
        amount: perGridAmount,
        marginUsed: perGridMargin,
        fee: 0,
      });

      orders.push({
        id: orderId++,
        price: buyPrice,
        type: "buy",
        filled: false,
        filledPrice: null,
        fillTime: null,
        amount: perGridAmount,
        marginUsed: 0,
        fee: 0,
      });
    }
  } else {
    // longshort 双向中性：中位价以下挂 buy（开多），中位价以上挂 sell（开空）
    // 这样价格来回穿越时，多空分别触发形成对冲
    const midIdx = Math.floor(prices.length / 2);
    for (let i = 0; i < prices.length; i++) {
      const p = prices[i];
      if (i <= midIdx) {
        // 下半部分：开多挂单
        orders.push({
          id: orderId++,
          price: p,
          type: "buy",
          filled: false, filledPrice: null, fillTime: null,
          amount: perGridAmount, marginUsed: perGridMargin, fee: 0,
        });
      } else {
        // 上半部分：开空挂单
        orders.push({
          id: orderId++,
          price: p,
          type: "sell",
          filled: false, filledPrice: null, fillTime: null,
          amount: perGridAmount, marginUsed: perGridMargin, fee: 0,
        });
      }
    }
  }

  return orders;
}

/**
 * 核心回测引擎
 */
export function runBacktest(cfg: BacktestConfig): BacktestResult {
  const { grid, candles, fundingRates } = cfg;
  const { totalMargin, leverage, maintenanceMarginRate, makerRate, takerRate, direction } = grid;

  if (candles.length === 0) throw new Error("没有 K 线数据");

  // 初始化
  let orders: GridOrder[] = generateGridOrders(grid).map((o) => ({ ...o }));
  const pos = new PositionTracker();

  let marginBalance = totalMargin; // 可用保证金（已扣除手续费和资金费）
  let totalFee = 0;
  let totalFundingPayment = 0;

  const trades: Trade[] = [];
  const fundingPayments: FundingPayment[] = [];
  const equityCurve: EquitySnapshot[] = [];

  let liquidated = false;
  let liquidationTime: number | null = null;

  let peakEquity = totalMargin;
  let maxDrawdown = 0;
  let maxDDStart = candles[0].openTime;
  let maxDDEnd = candles[0].openTime;

  let lastFundingIndex = 0;
  const fundingTimes = fundingRates.map((f) => f.settleTime);

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const currentPrice = candle.close;

    // === 1. 触发网格订单 ===
    const triggered: GridOrder[] = [];
    for (const order of orders) {
      if (order.filled || liquidated) continue;
      const isBuy = order.type === "buy";
      if ((isBuy && candle.low <= order.price) || (!isBuy && candle.high >= order.price)) {
        triggered.push(order);
      }
    }

    // 买单先按价格从高到低（高价买单优先成交），卖单从低到高
    triggered.sort((a, b) => a.price - b.price);

    for (const order of triggered) {
      order.filled = true;
      order.filledPrice = order.price;
      order.fillTime = candle.openTime;

      const notional = order.amount * order.price;
      const fee = notional * makerRate;
      order.fee = fee;
      totalFee += fee;
      marginBalance -= fee;

      if (direction === "long") {
        if (order.type === "buy") {
          pos.openLong(order.amount, order.price);
          trades.push({
            time: candle.openTime, price: order.price, side: "open_long",
            amount: order.amount, notional, margin: notional / leverage, fee,
            gridIndex: order.id,
          });
        } else {
          const closedAmount = Math.min(order.amount, pos.longAmount);
          pos.closeLong(closedAmount);
          // 平多已实现盈亏 = (平仓价 - 开仓均价) × 平仓数量
          // 但因为多次 open 后 close，这里简化：closeLong 返回 pnl
          trades.push({
            time: candle.openTime, price: order.price, side: "close_long",
            amount: order.amount, notional, margin: 0, fee,
            gridIndex: order.id,
          });
        }
      } else if (direction === "short") {
        if (order.type === "sell") {
          pos.openShort(order.amount, order.price);
          trades.push({
            time: candle.openTime, price: order.price, side: "open_short",
            amount: order.amount, notional, margin: notional / leverage, fee,
            gridIndex: order.id,
          });
        } else {
          const closedAmount = Math.min(order.amount, pos.shortAmount);
          pos.closeShort(closedAmount);
          trades.push({
            time: candle.openTime, price: order.price, side: "close_short",
            amount: order.amount, notional, margin: 0, fee,
            gridIndex: order.id,
          });
        }
      } else {
        // longshort 双向独立开仓
        if (order.type === "buy") {
          pos.openLong(order.amount, order.price);
          trades.push({
            time: candle.openTime, price: order.price, side: "open_long",
            amount: order.amount, notional, margin: notional / leverage, fee,
            gridIndex: order.id,
          });
        } else {
          pos.openShort(order.amount, order.price);
          trades.push({
            time: candle.openTime, price: order.price, side: "open_short",
            amount: order.amount, notional, margin: notional / leverage, fee,
            gridIndex: order.id,
          });
        }
      }
    }

    // === 2. 资金费率结算 ===
    while (lastFundingIndex < fundingRates.length && fundingTimes[lastFundingIndex] <= candle.openTime) {
      const fr = fundingRates[lastFundingIndex];
      const longNotional = pos.getLongNotional(currentPrice);
      const shortNotional = pos.getShortNotional(currentPrice);
      const payment = fr.fundingRate * (longNotional - shortNotional);
      marginBalance -= payment;
      totalFundingPayment += payment;

      fundingPayments.push({
        settleTime: fr.settleTime,
        fundingRate: fr.fundingRate,
        payment: -payment,
        totalLong: longNotional,
        totalShort: shortNotional,
      });

      lastFundingIndex++;
    }

    // === 3. 计算账户权益 ===
    const unrealizedPnL = pos.getUnrealizedPnL(currentPrice);
    const equity = marginBalance + unrealizedPnL;

    const longNotional = pos.getLongNotional(currentPrice);
    const shortNotional = pos.getShortNotional(currentPrice);
    const totalNotional = longNotional + shortNotional;
    const maintenanceMargin = totalNotional * maintenanceMarginRate;
    const marginRate = maintenanceMargin > 0 ? (equity / maintenanceMargin) * 100 : 99999;

    equityCurve.push({
      time: candle.openTime,
      price: currentPrice,
      totalLong: longNotional,
      totalShort: shortNotional,
      marginBalance,
      unrealizedPnL,
      equity,
      marginRate,
    });

    // === 4. 强平检查 ===
    if (!liquidated && maintenanceMargin > 0 && equity <= maintenanceMargin) {
      liquidated = true;
      liquidationTime = candle.openTime;
      pos.reset();
      // 强平后权益归零（实际 Gate.io 会扣除维持保证金作为手续费）
      marginBalance = 0;
      const lastSnap = equityCurve[equityCurve.length - 1];
      lastSnap.totalLong = 0;
      lastSnap.totalShort = 0;
      lastSnap.marginBalance = 0;
      lastSnap.unrealizedPnL = 0;
      lastSnap.equity = 0;
      lastSnap.marginRate = 0;
    }

    // === 5. 回撤 ===
    if (equity > peakEquity) peakEquity = equity;
    const dd = peakEquity > 0 ? (peakEquity - Math.max(0, equity)) / peakEquity : 0;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDDStart = findEquityTime(equityCurve, peakEquity);
      maxDDEnd = candle.openTime;
    }
  }

  // === 计算最终结果 ===
  const lastSnap = equityCurve[equityCurve.length - 1];
  const finalEquity = Math.max(0, lastSnap.equity);
  const gridPnL = calcGridPnL(trades);
  const days = (candles[candles.length - 1].openTime - candles[0].openTime) / 86400;
  const totalReturnPct = ((finalEquity - totalMargin) / totalMargin) * 100;
  const annualizedPct = days > 0 && finalEquity > 0
    ? (Math.pow(finalEquity / totalMargin, 365 / days) - 1) * 100
    : 0;

  return {
    initialMargin: totalMargin,
    finalEquity,
    totalReturn: finalEquity - totalMargin,
    totalReturnPct,
    annualizedReturnPct: annualizedPct,
    maxDrawdown: maxDrawdown * 100,
    maxDrawdownStart: maxDDStart,
    maxDrawdownEnd: maxDDEnd,
    finalMarginRate: lastSnap.marginRate,
    estimatedLiquidationPrice: calcEstLiqPrice(grid, pos, candles[0].close),
    gridPnL,
    directionPnL: finalEquity - totalMargin - gridPnL - totalFundingPayment + totalFee,
    totalFundingPayment: Math.abs(totalFundingPayment),
    totalFee,
    totalTrades: trades.length,
    gridTrades: trades.length,
    avgGridFillPrice: trades.length > 0
      ? trades.reduce((s, t) => s + t.price, 0) / trades.length
      : candles[0].close,
    trades,
    fundingPayments,
    equityCurve,
    candles,
    liquidated,
    liquidationTime,
  };
}

/** 网格价差收益 = 平仓收入 - 开仓成本 */
function calcGridPnL(trades: Trade[]): number {
  let cost = 0, income = 0;
  for (const t of trades) {
    if (t.side === "open_long" || t.side === "open_short") cost += t.notional;
    else income += t.notional;
  }
  return income - cost;
}

/** 预估强平价 */
function calcEstLiqPrice(grid: GridConfig, pos: PositionTracker, currentPrice: number): number {
  if (pos.longAmount > 0 && pos.shortAmount === 0) {
    // 纯多头强平价
    const r = grid.maintenanceMarginRate;
    const equityNeeded = pos.longAmount * r * currentPrice;
    // equity = margin + longAmount * (liqPrice - avgPrice) = equityNeeded
    // 假设 margin 刚好用完
    return pos.longAvgPrice * (1 - r * grid.leverage * 0.5);
  }
  if (pos.shortAmount > 0 && pos.longAmount === 0) {
    return pos.shortAvgPrice * (1 + grid.maintenanceMarginRate * grid.leverage * 0.5);
  }
  return currentPrice;
}

function findEquityTime(curve: EquitySnapshot[], target: number): number {
  for (const s of curve) if (s.equity >= target - 0.01) return s.time;
  return curve[0]?.time ?? 0;
}
