import type { NextConfig } from "next";

/**
 * Railway / tek konteyner: `npm start` ile Next `PORT`ta, Socket `SOCKET_PORT`ta
 * çalışırken tarayıcıya tek public URL vermek için. Örn. Railway env:
 * `INTERNAL_SOCKET_PROXY_URL=http://127.0.0.1:3001`
 * ve `NEXT_PUBLIC_SOCKET_SERVER_URL` = sayfanın aynı `https://…` kökü.
 * Vercel’de bu değişkeni tanımlamayın (Vercel’de yerel socket yok).
 */
const socketProxyBase =
  process.env.INTERNAL_SOCKET_PROXY_URL?.trim().replace(/\/$/, "") || "";

const nextConfig: NextConfig = {
  async rewrites() {
    if (!socketProxyBase) {
      return [];
    }
    return [
      {
        source: "/socket.io/:path*",
        destination: `${socketProxyBase}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
