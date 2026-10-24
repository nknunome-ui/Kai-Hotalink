import type { NextConfig } from "next";

// 画面はログイン後にブラウザでデータを取得する作りなので、
// キャッシュ系の実験的機能（cacheComponents など）は使わない。
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
