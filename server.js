/* eslint-disable @typescript-eslint/no-require-imports */
require("dotenv").config();
const { loadEnvConfig } = require("./backend/config/env");
const { createRealtimeServer } = require("./backend/createRealtimeServer");

async function start() {
  try {
    const env = loadEnvConfig();
    const { httpServer, storeKind } = await createRealtimeServer(env);

    // Sunucuyu başlat
    const server = httpServer.listen(env.port, () => {
      console.log(`-----------------------------------------`);
      console.log(`🚀 Dumbasscord Motoru Aktif!`);
      console.log(`📍 Port: ${env.port}`);
      console.log(`📦 Store: ${storeKind}`);
      console.log(`🧭 HTTP Routes:`);
      console.log(`   - GET /healthz`);
      console.log(`   - GET /__backend-signature`);
      console.log(`   - POST /auth/register`);
      console.log(`   - POST /auth/login`);
      console.log(`-----------------------------------------`);
    });

    // Sunucu başlatma hatalarını yakala
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ HATA: ${env.port} portu zaten kullanımda!`);
      } else {
        console.error(`❌ Sunucu hatası:`, err);
      }
    });

  } catch (error) {
    console.error("💥 Sunucu başlatılırken kritik hata oluştu:");
    console.error(error);
    process.exit(1); // Hatayla birlikte süreci durdur
  }
}

start();