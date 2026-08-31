import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ETH 合约网格回测 & 模拟",
  description: "Gate.io 永续合约网格策略回测 + 蒙特卡洛模拟",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
