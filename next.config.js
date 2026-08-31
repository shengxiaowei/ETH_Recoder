/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Zeabur 上需要把 SQLite 数据目录设为可持久化
  // 在 Zeabur 挂载 /data 后，SQLite 文件放那里
};

module.exports = nextConfig;
