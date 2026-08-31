/**
 * Gate.io 永续合约 API 客户端
 * 文档：https://www.gate.io/docs/developers/apiv4/zh_CN/#永续合约
 * 
 * 全部使用公共接口，不需要 API Key
 * 限速：200 次/10 秒/IP（足够我们用）
 */

const BASE_URL = "https://api.gateio.ws/api/v4";

export type GateInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "8h" | "1d" | "7d";

export interface GateCandlestick {
  t: number; // Unix timestamp (秒) - 开盘时间
  o: string; // open
  h: string; // high
  l: string; // low
  c: string; // close
  v: string; // volume
}

export interface GateFundingRate {
  t: number; // 结算时间 Unix timestamp
  r: string; // 资金费率
}

export interface GateContract {
  name: string; // 合约名 'ETH_USDT'
  type: string; // 'usdt'
  quanto_multiplier: string; // 1 张 = 多少币
  tick_size: string; // 最小价格变动
  leverage_max: number; // 最大杠杆
  risk_limit: string; // 风险限额（张）
  funding_interval: number; // 资金费率间隔（小时）
}

export interface GateFee {
  contract: string;
  user: string;
  taker_fee: string;
  maker_fee: string;
}

export interface Candlestick {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface FundingRate {
  settleTime: number;
  fundingRate: number;
}

/**
 * 通用 fetch 封装，带重试和限速
 */
async function gateFetch<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(BASE_URL + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.append(k, String(v));
    }
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`Gate.io API ${res.status}: ${await res.text()}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      // 简单退避重试
      await new Promise((r) => setTimeout(r, (attempt + 1) * 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * 获取合约 K 线数据
 * GET /futures/{settle}/candlesticks
 *
 * @param contract 合约名，如 'ETH_USDT'
 * @param interval K 线粒度
 * @param limit 最多 1000 条
 * @param from 起始时间 Unix timestamp（可选）
 * @param to 结束时间 Unix timestamp（可选）
 */
export async function fetchCandlesticks(params: {
  contract: string;
  interval: GateInterval;
  limit?: number;
  from?: number;
  to?: number;
}): Promise<Candlestick[]> {
  // Gate.io 不允许 limit 与 from/to 同时传
  const hasRange = params.from !== undefined || params.to !== undefined;
  const raw = await gateFetch<GateCandlestick[]>(`/futures/usdt/candlesticks`, {
    contract: params.contract,
    interval: params.interval,
    ...(!hasRange ? { limit: params.limit ?? 1000 } : {}),
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
  });

  // Gate.io 返回的是按时间倒序排列的，需要反转为正序
  return raw
    .reverse()
    .map((c) => ({
      openTime: c.t,
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v),
      closeTime: c.t + intervalToSeconds(params.interval),
    }));
}

/**
 * 获取资金费率历史
 * GET /futures/{settle}/funding_rate
 */
export async function fetchFundingRates(params: {
  contract: string;
  limit?: number;
  from?: number;
  to?: number;
}): Promise<FundingRate[]> {
  const hasRange = params.from !== undefined || params.to !== undefined;
  const raw = await gateFetch<GateFundingRate[]>(`/futures/usdt/funding_rate`, {
    contract: params.contract,
    ...(!hasRange ? { limit: params.limit ?? 1000 } : {}),
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
  });

  return raw.reverse().map((r) => ({
    settleTime: r.t,
    fundingRate: parseFloat(r.r),
  }));
}

/**
 * 获取合约规格
 * 注意：GET /futures/usdt/contracts/{contract} 返回的是对象，不是数组
 */
export async function fetchContractInfo(contract: string): Promise<GateContract> {
  const info = await gateFetch<GateContract>(`/futures/usdt/contracts/${contract}`);
  if (!info || !info.name) throw new Error(`合约不存在: ${contract}`);
  return info;
}

/**
 * 获取所有 USDT 本位永续合约列表
 */
export async function fetchAllContracts(): Promise<GateContract[]> {
  return gateFetch<GateContract[]>(`/futures/usdt/contracts`);
}

/**
 * 粒度转换为秒数
 */
export function intervalToSeconds(interval: GateInterval): number {
  const map: Record<GateInterval, number> = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "8h": 28800,
    "1d": 86400,
    "7d": 604800,
  };
  return map[interval];
}
