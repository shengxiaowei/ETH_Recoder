/**
 * 核心引擎共享类型定义
 */

/** K 线数据（精简版，引擎用） */
export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

/** 资金费率记录 */
export interface FundingRecord {
  settleTime: number;
  fundingRate: number; // 正数=多付空，负数=空付多
}

/** 网格方向模式 */
export type GridDirection = "long" | "short" | "longshort";

/** 网格排列模式 */
export type GridMode = "arithmetic" | "geometric";

/** 网格配置 */
export interface GridConfig {
  direction: GridDirection;
  mode: GridMode;
  priceMin: number; // 价格下限
  priceMax: number; // 价格上限
  gridCount: number; // 网格数量
  leverage: number; // 杠杆倍数 1-125
  totalMargin: number; // 总投入保证金（USDT）
  makerRate: number; // maker 费率（默认 0.0002）
  takerRate: number; // taker 费率（默认 0.0005）
  maintenanceMarginRate: number; // 维持保证金率（默认 0.005 = 0.5%）
}

/** 单笔网格订单 */
export interface GridOrder {
  id: number;
  price: number; // 挂单价格
  // 买单（lower price）：上涨时卖出平仓 → 赚价差
  // 卖单（higher price）：下跌时买入平仓 → 赚价差
  type: "buy" | "sell"; // 相对于现货的买卖
  filled: boolean;
  filledPrice: number | null;
  fillTime: number | null;
  amount: number; // 成交数量（币）
  marginUsed: number; // 这笔占用的保证金
  fee: number; // 手续费
}

/** 回测引擎配置 */
export interface BacktestConfig {
  grid: GridConfig;
  candles: Candle[];
  fundingRates: FundingRecord[];
  contractSize: number; // 合约张乘数（1 张 = 多少币）
}

/** 交易记录（回测产生的） */
export interface Trade {
  time: number;
  price: number;
  side: "open_long" | "close_long" | "open_short" | "close_short";
  amount: number; // 币数量
  notional: number; // 名义价值（USDT）
  margin: number; // 保证金
  fee: number; // 手续费
  gridIndex: number; // 触发的网格序号
}

/** 资金费率结算记录 */
export interface FundingPayment {
  settleTime: number;
  fundingRate: number;
  payment: number; // 正数=收到，负数=支付
  totalLong: number; // 当时多头名义价值
  totalShort: number; // 当时空头名义价值
}

/** 权益快照（每个 K 线结束后） */
export interface EquitySnapshot {
  time: number;
  price: number;
  totalLong: number; // 多头名义价值
  totalShort: number; // 空头名义价值
  marginBalance: number; // 保证金属性
  unrealizedPnL: number; // 未实现盈亏
  equity: number; // 账户权益 = 保证金 + 未实现盈亏
  marginRate: number; // 保证金率
}

/** 回测结果 */
export interface BacktestResult {
  // 最终指标
  initialMargin: number;
  finalEquity: number;
  totalReturn: number; // 收益金额
  totalReturnPct: number; // 收益率 %
  annualizedReturnPct: number; // 年化
  maxDrawdown: number; // 最大回撤 %
  maxDrawdownStart: number;
  maxDrawdownEnd: number;
  finalMarginRate: number; // 结束时的保证金率
  estimatedLiquidationPrice: number; // 预估强平价

  // 收益拆解
  gridPnL: number; // 网格价差收益
  directionPnL: number; // 方向收益（持仓带来的）
  totalFundingPayment: number; // 资金费率净支付（负数=我们付了）
  totalFee: number; // 总手续费

  // 交易统计
  totalTrades: number;
  gridTrades: number; // 网格触发次数
  avgGridFillPrice: number;

  // 明细数据
  trades: Trade[];
  fundingPayments: FundingPayment[];
  equityCurve: EquitySnapshot[];
  candles: Candle[]; // 原始 K 线（给图表用）

  // 强平标记
  liquidated: boolean;
  liquidationTime: number | null;
}

/** 模拟配置 */
export interface SimulateConfig {
  grid: GridConfig;
  candles: Candle[]; // 历史数据（用于拟合分布）
  fundingRates: FundingRecord[];
  contractSize: number;
  simulationCount: number; // 模拟路径数
  simulateDays: number; // 模拟未来多少天
  model: "bootstrap" | "gbm"; // 模拟模型
}

/** 单条模拟路径结果 */
export interface SimPathResult {
  pathIndex: number;
  finalEquity: number;
  returnPct: number;
  gridPnL: number;
  directionPnL: number;
  fundingPayment: number;
  fee: number;
  liquidated: boolean;
  liquidationTime: number | null;
  simulatedCandles: Candle[]; // 模拟生成的 K 线（中位数路径时展示）
}

/** 模拟汇总结果 */
export interface SimulateResult {
  paths: SimPathResult[];
  // 统计
  liquidationRate: number; // 爆仓概率 %
  expectedReturnPct: number; // 期望收益率
  medianReturnPct: number; // 中位数收益率
  var95: number; // VaR 95%
  cvar95: number; // CVaR 95%
  percentileP5: number;
  percentileP25: number;
  percentileP75: number;
  percentileP95: number;
  // 中位数路径的详细回测
  medianPathResult: BacktestResult | null;
}
