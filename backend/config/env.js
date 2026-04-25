const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://communication-app-eight.vercel.app",
];

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

function parseOrigins(originsValue) {
  if (!originsValue) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return originsValue
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
}

function buildCorsOriginValidator(allowedOrigins) {
  const normalizedAllowedOrigins = allowedOrigins.map((origin) =>
    normalizeOrigin(origin)
  );
  return (origin, callback) => {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin || normalizedAllowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed by CORS"));
  };
}

function loadEnvConfig() {
  const allowedOrigins = parseOrigins(process.env.ALLOWED_ORIGINS);

  return {
    port: Number(process.env.PORT || 3001),
    socketPath: process.env.SOCKET_PATH || "/socket.io",
    serverAuthToken: process.env.SOCKET_AUTH_TOKEN || "",
    clientAuthToken: process.env.NEXT_PUBLIC_SOCKET_AUTH_TOKEN || "",
    socketServerUrl:
      process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001",
    allowedOrigins,
    corsOriginValidator: buildCorsOriginValidator(allowedOrigins),
    persistenceFile:
      process.env.PERSISTENCE_FILE || "backend/persistence/data.json",
    databaseUrl: process.env.DATABASE_URL || "",
  };
}

module.exports = {
  loadEnvConfig,
};
