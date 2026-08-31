"use client";

import { useState } from "react";

interface ConfigFormProps {
  onBacktest: (config: any) => void;
  onSimulate: (config: any) => void;
  onSync: () => void;
  loading: boolean;
}

export default function ConfigForm({ onBacktest, onSimulate, onSync, loading }: ConfigFormProps) {
  const [form, setForm] = useState({
    contract: "ETH_USDT",
    interval: "4h",
    fromDate: getDateString(365), // 1 年前
    toDate: getDateString(0), // 今天
    direction: "long" as "long" | "short" | "longshort",
    mode: "arithmetic" as "arithmetic" | "geometric",
    priceMin: 1600,
    priceMax: 3200,
    gridCount: 20,
    leverage: 10,
    totalMargin: 1000,
    simulateDays: 30,
    simulationCount: 300,
    model: "bootstrap" as "bootstrap" | "gbm",
  });

  function getDateString(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  }

  function handleChange<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildBacktestConfig() {
    return {
      contract: form.contract,
      interval: form.interval,
      from: Math.floor(new Date(form.fromDate).getTime() / 1000),
      to: Math.floor(new Date(form.toDate).getTime() / 1000) + 86400,
      grid: {
        direction: form.direction,
        mode: form.mode,
        priceMin: form.priceMin,
        priceMax: form.priceMax,
        gridCount: form.gridCount,
        leverage: form.leverage,
        totalMargin: form.totalMargin,
      },
    };
  }

  function buildSimulateConfig() {
    return {
      contract: form.contract,
      interval: form.interval,
      simulateDays: form.simulateDays,
      simulationCount: form.simulationCount,
      model: form.model,
      grid: {
        direction: form.direction,
        mode: form.mode,
        priceMin: form.priceMin,
        priceMax: form.priceMax,
        gridCount: form.gridCount,
        leverage: form.leverage,
        totalMargin: form.totalMargin,
      },
    };
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-200">策略配置</h2>
        <button
          onClick={onSync}
          disabled={loading}
          className="text-xs px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-md transition-colors disabled:opacity-50"
        >
          🔄 同步数据
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 合约 */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">合约</label>
          <select
            value={form.contract}
            onChange={(e) => handleChange("contract", e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm"
          >
            <option value="ETH_USDT">ETH_USDT</option>
            <option value="BTC_USDT">BTC_USDT</option>
          </select>
        </div>

        {/* K 线粒度 */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">K 线粒度</label>
          <select
            value={form.interval}
            onChange={(e) => handleChange("interval", e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm"
          >
            <option value="1h">1 小时</option>
            <option value="4h">4 小时</option>
            <option value="1d">1 天</option>
          </select>
        </div>

        {/* 回测开始 */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">回测开始</label>
          <input
            type="date"
            value={form.fromDate}
            onChange={(e) => handleChange("fromDate", e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm"
          />
        </div>

        {/* 回测结束 */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">回测结束</label>
          <input
            type="date"
            value={form.toDate}
            onChange={(e) => handleChange("toDate", e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm"
          />
        </div>

        {/* 方向 */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">网格方向</label>
          <select
            value={form.direction}
            onChange={(e) => handleChange("direction", e.target.value as any)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm"
          >
            <option value="long">纯多头</option>
            <option value="short">纯空头</option>
            <option value="longshort">双向中性</option>
          </select>
        </div>

        {/* 模式 */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">网格模式</label>
          <select
            value={form.mode}
            onChange={(e) => handleChange("mode", e.target.value as any)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm"
          >
            <option value="arithmetic">等差</option>
            <option value="geometric">等比</option>
          </select>
        </div>

        {/* 价格下限 */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">价格下限</label>
          <input
            type="number"
            value={form.priceMin}
            onChange={(e) => handleChange("priceMin", Number(e.target.value))}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm"
          />
        </div>

        {/* 价格上限 */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">价格上限</label>
          <input
            type="number"
            value={form.priceMax}
            onChange={(e) => handleChange("priceMax", Number(e.target.value))}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm"
          />
        </div>

        {/* 网格数 */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">网格数量</label>
          <input
            type="number"
            min={2}
            max={50}
            value={form.gridCount}
            onChange={(e) => handleChange("gridCount", Number(e.target.value))}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm"
          />
        </div>

        {/* 杠杆 */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">杠杆 ({form.leverage}x)</label>
          <input
            type="range"
            min={1}
            max={125}
            value={form.leverage}
            onChange={(e) => handleChange("leverage", Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* 保证金 */}
        <div className="col-span-2">
          <label className="text-xs text-neutral-400 mb-1 block">投入保证金 (USDT)</label>
          <input
            type="number"
            value={form.totalMargin}
            onChange={(e) => handleChange("totalMargin", Number(e.target.value))}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="border-t border-neutral-800 pt-4">
        <h3 className="text-sm font-medium text-neutral-300 mb-3">模拟参数</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">模拟天数</label>
            <input
              type="number"
              value={form.simulateDays}
              onChange={(e) => handleChange("simulateDays", Number(e.target.value))}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">模拟路径数</label>
            <input
              type="number"
              value={form.simulationCount}
              onChange={(e) => handleChange("simulationCount", Number(e.target.value))}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">模拟模型</label>
            <select
              value={form.model}
              onChange={(e) => handleChange("model", e.target.value as any)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm"
            >
              <option value="bootstrap">Bootstrap</option>
              <option value="gbm">GBM</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => onBacktest(buildBacktestConfig())}
          disabled={loading}
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {loading ? "运行中..." : "🚀 运行回测"}
        </button>
        <button
          onClick={() => onSimulate(buildSimulateConfig())}
          disabled={loading}
          className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {loading ? "运行中..." : "🎲 运行模拟"}
        </button>
      </div>
    </div>
  );
}
