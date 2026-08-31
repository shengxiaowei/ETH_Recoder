"use client";

interface BacktestSummaryProps {
  result: any;
}

export default function BacktestSummary({ result }: BacktestSummaryProps) {
  if (!result) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3">回测结果</h2>
        <div className="text-neutral-500 text-sm">暂无结果，请先运行回测</div>
      </div>
    );
  }

  const isProfit = result.totalReturn >= 0;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">回测结果</h2>
        {result.liquidated && (
          <span className="px-2 py-0.5 bg-red-900/50 text-red-400 text-xs rounded">
            💥 已强平
          </span>
        )}
      </div>

      {/* 核心指标 */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="最终权益"
          value={`$${result.finalEquity.toFixed(2)}`}
          highlight
        />
        <MetricCard
          label={isProfit ? "总收益" : "总亏损"}
          value={`${isProfit ? "+" : ""}$${result.totalReturn.toFixed(2)}`}
          valueColor={isProfit ? "text-green-400" : "text-red-400"}
        />
        <MetricCard
          label="收益率"
          value={`${isProfit ? "+" : ""}${result.totalReturnPct.toFixed(2)}%`}
          valueColor={isProfit ? "text-green-400" : "text-red-400"}
        />
        <MetricCard
          label="年化收益率"
          value={`${result.annualizedReturnPct.toFixed(1)}%`}
          valueColor={result.annualizedReturnPct >= 0 ? "text-green-400" : "text-red-400"}
        />
        <MetricCard
          label="最大回撤"
          value={`-${result.maxDrawdown.toFixed(2)}%`}
          valueColor="text-red-400"
        />
        <MetricCard
          label="预估强平价"
          value={`$${result.estimatedLiquidationPrice?.toFixed(2) || "-"}`}
        />
      </div>

      {/* 收益拆解 */}
      <div>
        <h3 className="text-sm font-medium text-neutral-300 mb-2">收益拆解</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <BreakdownItem label="网格价差" value={result.gridPnL} />
          <BreakdownItem label="手续费支出" value={-result.totalFee} isCost />
          <BreakdownItem label="资金费率净支付" value={-result.totalFundingPayment} isCost />
          <BreakdownItem label="交易次数" value={result.totalTrades} isCount />
        </div>
      </div>
    </div>
  );
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
        highlight ? "border-blue-800 bg-blue-950/30" : "border-neutral-800 bg-neutral-950"
      }`}
    >
      <div className="text-xs text-neutral-400 mb-1">{label}</div>
      <div className={`text-lg font-semibold ${valueColor || "text-neutral-100"}`}>
        {value}
      </div>
    </div>
  );
}

function BreakdownItem({
  label,
  value,
  isCost,
  isCount,
}: {
  label: string;
  value: number;
  isCost?: boolean;
  isCount?: boolean;
}) {
  let color = "text-neutral-300";
  if (!isCount) {
    color = value >= 0 ? "text-green-400" : "text-red-400";
    if (isCost && value < 0) color = "text-red-400";
  }
  return (
    <div className="flex justify-between bg-neutral-950 px-3 py-2 rounded">
      <span className="text-neutral-400">{label}</span>
      <span className={color}>
        {isCount ? value : `${value >= 0 ? "+" : ""}$${value.toFixed(2)}`}
      </span>
    </div>
  );
}
