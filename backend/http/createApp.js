/* eslint-disable @typescript-eslint/no-require-imports */
const express = require("express");
const cookieParser = require("cookie-parser");
const authRoutes = require("../modules/auth/auth.routes");
const serverRoutes = require("../modules/servers/servers.routes");
const channelRoutes = require("../modules/channels/channels.routes");
const messageRoutes = require("../modules/messages/messages.routes");

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

function isAllowedOrigin(origin, allowedOrigins) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return true;
  }
  const allowed = (allowedOrigins || []).map((entry) => normalizeOrigin(entry));
  return allowed.includes(normalizedOrigin);
}

function createApp({ env }) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;
    if (isAllowedOrigin(requestOrigin, env.allowedOrigins)) {
      res.setHeader(
        "Access-Control-Allow-Origin",
        requestOrigin || env.allowedOrigins[0] || "*"
      );
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Vary", "Origin");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/__backend-signature", (_req, res) => {
    res.json({
      service: "dumbasscord-socket-backend",
      authRoutes: [
        "/auth/register",
        "/auth/login",
        "/auth/me",
        "/auth/refresh",
        "/api/auth/register",
      ],
      corsOrigins: env.allowedOrigins,
    });
  });

  // Backward-compatible auth routes used by existing frontend
  app.use("/auth", authRoutes);
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
