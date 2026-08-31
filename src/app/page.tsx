"use client";

import { useState } from "react";
import ConfigForm from "@/components/ConfigForm";
import CandlestickChart from "@/components/CandlestickChart";
import BacktestSummary from "@/components/BacktestSummary";
import SimulateSummary from "@/components/SimulateSummary";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [simulateSummary, setSimulateSummary] = useState<any>(null);
  const [syncMsg, setSyncMsg] = useState<string>("");

  async function handleBacktest(config: any) {
    setLoading(true);
    setError(null);
    setSimulateSummary(null);

    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "回测失败");
      setBacktestResult(data.result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSimulate(config: any) {
    setLoading(true);
    setError(null);
    setBacktestResult(null);

    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "模拟失败");
      setSimulateSummary({ ...data.summary, pathsCount: data.paths?.length });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncMsg("同步中...");
    try {
      const res = await fetch("/api/data/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSyncMsg("✅ 同步完成");
    } catch (err: any) {
      setSyncMsg(`❌ 同步失败: ${err.message}`);
    }
    setTimeout(() => setSyncMsg(""), 3000);
  }

  return (
    <main className="min-h-screen p-6 md:p-8">
      {/* 头部 */}
      <header className="max-w-7xl mx-auto mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-neutral-100">
          📊 ETH 合约网格 <span className="text-blue-400">回测 & 模拟</span>
        </h1>
        <p className="text-neutral-400 text-sm mt-1">
          Gate.io 永续合约 · 支持杠杆/资金费率/强平模拟 · 蒙特卡洛未来推演
        </p>
      </header>

      {/* 错误提示 */}
      {error && (
        <div className="max-w-7xl mx-auto mb-4 px-4 py-3 bg-red-950/50 border border-red-900 rounded-lg text-red-400 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* 主内容区 */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：配置 + 结果 */}
        <div className="lg:col-span-1 space-y-6">
          <ConfigForm
            onBacktest={handleBacktest}
            onSimulate={handleSimulate}
            onSync={handleSync}
            loading={loading}
          />

          {syncMsg && (
            <div className="text-center text-xs text-neutral-400">{syncMsg}</div>
          )}

          {backtestResult && !simulateSummary && (
            <BacktestSummary result={backtestResult} />
          )}

          {simulateSummary && !backtestResult && (
            <SimulateSummary summary={simulateSummary} />
          )}
        </div>

        {/* 右侧：K 线图表 */}
        <div className="lg:col-span-2">
          <CandlestickChart
            candles={backtestResult?.candles || []}
          />

          {/* 权益曲线 */}
          {backtestResult?.equityCurve?.length > 0 && (
            <div className="mt-4 bg-neutral-900 border border-neutral-800 rounded-xl p-3">
              <h3 className="text-sm font-medium text-neutral-300 mb-2">权益曲线</h3>
              <EquityChart curve={backtestResult.equityCurve} />
            </div>
          )}
        </div>
      </div>

      {/* 底部信息 */}
      <footer className="max-w-7xl mx-auto mt-8 text-center text-xs text-neutral-600">
        <p>⚠️ 本工具仅供研究学习使用，不构成投资建议。实盘交易请谨慎。</p>
        <p className="mt-1">数据源：Gate.io 公共 API · 部署平台：Zeabur</p>
      </footer>
    </main>
  );
}

/** 权益曲线小组件 */
function EquityChart({ curve }: { curve: any[] }) {
  if (!curve || curve.length === 0) return null;

  const data = curve.map((p) => [
    new Date(p.time * 1000).toLocaleDateString("zh-CN"),
    p.equity,
  ]);

  const min = Math.min(...curve.map((p) => p.equity));
  const max = Math.max(...curve.map((p) => p.equity));
  const range = max - min || 1;

  return (
    <div className="h-32 w-full relative overflow-hidden">
      {/* 网格 */}
      <div className="absolute inset-0 flex flex-col justify-between">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="border-t border-neutral-800" />
        ))}
      </div>
      {/* 曲线 */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          points={curve
            .map((p, i) => {
              const x = (i / (curve.length - 1)) * 100;
              const y = 100 - ((p.equity - min) / range) * 100;
              return `${x}%,${y}%`;
            })
            .join(" ")}
        />
        {/* 起点终点标记 */}
        <circle
          cx="0%"
          cy={100 - ((curve[0].equity - min) / range) * 100 + "%"}
          r="3"
          fill="#22c55e"
        />
        <circle
          cx="100%"
          cy={100 - ((curve[curve.length - 1].equity - min) / range) * 100 + "%"}
          r="3"
          fill={curve[curve.length - 1].equity >= curve[0].equity ? "#22c55e" : "#ef4444"}
        />
      </svg>
      <div className="absolute top-1 left-2 text-[10px] text-neutral-500">
        ${max.toFixed(2)}
      </div>
      <div className="absolute bottom-1 left-2 text-[10px] text-neutral-500">
        ${min.toFixed(2)}
      </div>
    </div>
  );
}
