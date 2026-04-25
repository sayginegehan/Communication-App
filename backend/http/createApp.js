/* eslint-disable @typescript-eslint/no-require-imports */
const express = require("express");
const cookieParser = require("cookie-parser");
const authRoutes = require("../modules/auth/auth.routes");
const serverRoutes = require("../modules/servers/servers.routes");
const channelRoutes = require("../modules/channels/channels.routes");
const messageRoutes = require("../modules/messages/messages.routes");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/servers", serverRoutes);
  app.use("/api/channels", channelRoutes);
  app.use("/api/messages", messageRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}

module.exports = {
  createApp,
};
