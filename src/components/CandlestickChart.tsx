"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface GridOrder {
  price: number;
  type: "buy" | "sell";
  filled: boolean;
  filledPrice: number | null;
}

interface CandlestickChartProps {
  candles: Candle[];
  gridOrders?: GridOrder[];
  gridPriceMin?: number;
  gridPriceMax?: number;
}

export default function CandlestickChart({
  candles,
  gridOrders = [],
  gridPriceMin,
  gridPriceMax,
}: CandlestickChartProps) {
  const option = useMemo(() => {
    if (candles.length === 0) return {};

    const times = candles.map((c) =>
      new Date(c.openTime * 1000).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    );

    const ohlc = candles.map((c) => [c.open, c.close, c.low, c.high]);
    const volumes = candles.map((c) => c.volume);

    // 网格线
    const gridLines = gridOrders
      .filter((o) => !o.filled)
      .map((o) => ({
        yAxis: o.price,
        lineStyle: {
          color: o.type === "buy" ? "#22c55e" : "#ef4444",
          type: "dashed",
          width: 1,
        },
        label: {
          show: true,
          formatter: `${o.price.toFixed(2)}`,
          position: "end",
          fontSize: 10,
        },
      }));

    // 已成交网格点
    const fillPoints = gridOrders
      .filter((o) => o.filled && o.filledPrice !== null)
      .map((o, i) => ({
        coord: [times[Math.min(i, times.length - 1)], o.filledPrice],
        symbolSize: 8,
        itemStyle: {
          color: o.type === "buy" ? "#22c55e" : "#ef4444",
        },
      }));

    return {
      backgroundColor: "transparent",
      animation: false,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        backgroundColor: "#1f2937",
        borderColor: "#374151",
        textStyle: { color: "#e5e7eb" },
      },
      axisPointer: {
        link: [{ xAxisIndex: "all" }],
        label: { backgroundColor: "#374151" },
      },
      grid: [
        { left: "10%", right: "8%", top: 30, height: "55%" },
        { left: "10%", right: "8%", top: "72%", height: "18%" },
      ],
      xAxis: [
        {
          type: "category",
          data: times,
          boundaryGap: false,
          axisLine: { lineStyle: { color: "#374151" } },
          axisLabel: { color: "#9ca3af", fontSize: 10 },
          splitLine: { show: false },
          min: "dataMin",
          max: "dataMax",
        },
        {
          type: "category",
          gridIndex: 1,
          data: times,
          boundaryGap: false,
          axisLine: { lineStyle: { color: "#374151" } },
          axisLabel: { show: false },
          splitLine: { show: false },
        },
      ],
      yAxis: [
        {
          scale: true,
          splitArea: { show: false },
          axisLine: { lineStyle: { color: "#374151" } },
          axisLabel: { color: "#9ca3af" },
          splitLine: { lineStyle: { color: "#1f2937" } },
        },
        {
          scale: true,
          gridIndex: 1,
          splitNumber: 2,
          axisLine: { lineStyle: { color: "#374151" } },
          axisLabel: { color: "#9ca3af", fontSize: 9 },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: [0, 1], start: 0, end: 100 },
        { show: true, xAxisIndex: [0, 1], type: "slider", bottom: 5, height: 20 },
      ],
      series: [
        {
          name: "K线",
          type: "candlestick",
          data: ohlc,
          itemStyle: {
            color: "#22c55e",
            color0: "#ef4444",
            borderColor: "#22c55e",
            borderColor0: "#ef4444",
          },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { type: "dashed", width: 1 },
            data: gridLines,
          },
        },
        {
          name: "成交量",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes,
          itemStyle: {
            color: (params: any) => {
              const idx = params.dataIndex;
              return ohlc[idx][1] >= ohlc[idx][0] ? "#22c55e55" : "#ef444455";
            },
          },
        },
      ],
    };
  }, [candles, gridOrders]);

  if (candles.length === 0) {
    return (
      <div className="h-96 flex items-center justify-center text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
        暂无数据，请先运行回测
      </div>
    );
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
      <ReactECharts option={option} style={{ height: 450 }} />
    </div>
  );
}
