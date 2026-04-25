const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://communication-app-eight.vercel.app",
];

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

/** ALLOWED_ORIGINS entry: allow any https deployment on vercel.app (previews + production). */
const VERCEL_WILDCARD_MARKERS = new Set([
  "https://*.vercel.app",
  "*.vercel.app",
]);

function parseOrigins(originsValue) {
  if (!originsValue) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return originsValue
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
}

function isHttpsVercelAppOrigin(origin) {
  try {
    const u = new URL(origin);
    return (
      u.protocol === "https:" &&
      (u.hostname === "vercel.app" || u.hostname.endsWith(".vercel.app"))
    );
  } catch {
    return false;
  }
}

function originAllowedByList(origin, allowedOrigins) {
  if (!origin) {
    return true;
  }
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  for (const entry of allowedOrigins) {
    if (VERCEL_WILDCARD_MARKERS.has(entry) && isHttpsVercelAppOrigin(origin)) {
      return true;
    }
  }
  return false;
}

function buildCorsOriginValidator(allowedOrigins) {
  return (origin, callback) => {
    const normalizedOrigin = normalizeOrigin(origin);
    if (originAllowedByList(normalizedOrigin, allowedOrigins)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin not allowed by CORS"));
  };
}

function resolveSocketListenPort() {
  const rawSocket = process.env.SOCKET_PORT;
  if (rawSocket != null && String(rawSocket).trim() !== "") {
    const n = Number(rawSocket);
    if (!Number.isNaN(n) && n > 0) {
      return n;
    }
  }
  return Number(process.env.PORT || 3001);
}

function loadEnvConfig() {
  const allowedOrigins = parseOrigins(process.env.ALLOWED_ORIGINS);

  return {
    port: resolveSocketListenPort(),
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
