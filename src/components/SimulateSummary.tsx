"use client";

interface SimulateSummaryProps {
  summary: any;
}

export default function SimulateSummary({ summary }: SimulateSummaryProps) {
  if (!summary) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3">模拟结果</h2>
        <div className="text-neutral-500 text-sm">暂无结果，请先运行模拟</div>
      </div>
    );
  }

  const histData = buildHistogram(summary);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-5">
      <h2 className="text-lg font-semibold">蒙特卡洛模拟结果</h2>

      {/* 核心指标 */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="期望收益率"
          value={`${summary.expectedReturnPct.toFixed(2)}%`}
          valueColor={summary.expectedReturnPct >= 0 ? "text-green-400" : "text-red-400"}
        />
        <MetricCard
          label="中位数收益率"
          value={`${summary.medianReturnPct.toFixed(2)}%`}
          valueColor={summary.medianReturnPct >= 0 ? "text-green-400" : "text-red-400"}
        />
        <MetricCard
          label="爆仓概率"
          value={`${summary.liquidationRate.toFixed(1)}%`}
          valueColor={summary.liquidationRate > 10 ? "text-red-400" : "text-yellow-400"}
          highlight
        />
        <MetricCard
          label="VaR 95%"
          value={`${summary.var95.toFixed(2)}%`}
          valueColor="text-red-400"
        />
        <MetricCard
          label="CVaR 95%"
          value={`${summary.cvar95.toFixed(2)}%`}
          valueColor="text-red-400"
        />
      </div>

      {/* 分位数分布 */}
      <div>
        <h3 className="text-sm font-medium text-neutral-300 mb-3">收益率分位数</h3>
        <div className="flex items-end gap-1 h-24 bg-neutral-950 rounded-lg p-2">
          {histData.map((item, i) => (
            <div
              key={i}
              className="flex-1 rounded-t transition-all"
              style={{
                height: `${(item.count / histData[0].count) * 100}%`,
                backgroundColor: item.return >= 0 ? "#22c55e" : "#ef4444",
                minHeight: "4px",
              }}
              title={`${item.label}: ${item.count} 条路径`}
            />
          ))}
        </div>
        <div className="flex justify-between text-xs text-neutral-500 mt-1 px-2">
          <span className="text-red-400">P5: {summary.percentileP5.toFixed(1)}%</span>
          <span className="text-neutral-300">P25: {summary.percentileP25.toFixed(1)}%</span>
          <span className="text-green-400">P50: {summary.medianReturnPct.toFixed(1)}%</span>
          <span className="text-neutral-300">P75: {summary.percentileP75.toFixed(1)}%</span>
          <span className="text-green-400">P95: {summary.percentileP95.toFixed(1)}%</span>
        </div>
      </div>

      {/* 说明 */}
      <div className="text-xs text-neutral-500 bg-neutral-950 rounded p-3 leading-relaxed">
        <p>📊 <strong>爆仓概率</strong>：在 {summary?.pathsCount || "N"} 条模拟路径中触发强平的比例</p>
        <p>📉 <strong>VaR 95%</strong>：95% 概率下最差不会低于这个收益率</p>
        <p>🔥 <strong>CVaR 95%</strong>：最糟糕 5% 情况的平均损失（尾部风险）</p>
      </div>
    </div>
  );
}

function buildHistogram(summary: any) {
  // 用分位数构建简化的直方图
  const bars = [];
  const spreads = [
    { label: "P0-P5", return: summary.percentileP5 - 15, count: 1 },
    { label: "P5-P25", return: summary.percentileP25 - 5, count: 2 },
    { label: "P25-P50", return: summary.medianReturnPct, count: 4 },
    { label: "P50-P75", return: summary.percentileP75, count: 4 },
    { label: "P75-P95", return: summary.percentileP95 + 5, count: 2 },
    { label: "P95-P100", return: summary.percentileP95 + 15, count: 1 },
  ];
  return spreads;
}

function MetricCard({
  label,
  value,
  highlight,
  valueColor,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  valueColor?: string;
}) {
  return (
    <div
      className={`p-3 rounded-lg border ${
        highlight ? "border-red-800 bg-red-950/30" : "border-neutral-800 bg-neutral-950"
      }`}
    >
      <div className="text-xs text-neutral-400 mb-1">{label}</div>
      <div className={`text-lg font-semibold ${valueColor || "text-neutral-100"}`}>
        {value}
      </div>
    </div>
  );
}
