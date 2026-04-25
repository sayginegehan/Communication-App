/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require("http");
const crypto = require("crypto");

const HASH_ALGORITHM = "sha512";
const HASH_ITERATIONS = 210000;
const HASH_KEY_LENGTH = 64;
const HASH_SEPARATOR = ".";

function json(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

function buildCorsHeaders(origin, allowedOrigins) {
  const normalizedOrigin = normalizeOrigin(origin);
  const normalizedAllowedOrigins = (allowedOrigins || []).map((entry) =>
    normalizeOrigin(entry)
  );
  const isAllowedOrigin = normalizedOrigin
    ? normalizedAllowedOrigins.includes(normalizedOrigin)
    : true;
  const fallback = normalizedAllowedOrigins[0] || "";
  const effectiveOrigin = isAllowedOrigin
    ? normalizedOrigin || fallback || "*"
    : fallback || "*";
  return {
    "Access-Control-Allow-Origin": effectiveOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM)
    .toString("hex");
  return [salt, derivedKey].join(HASH_SEPARATOR);
}

function verifyPassword(password, storedHash) {
  const [salt, storedKey] = String(storedHash || "").split(HASH_SEPARATOR);
  if (!salt || !storedKey) {
    return false;
  }
  const derivedKey = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM)
    .toString("hex");
  return crypto.timingSafeEqual(Buffer.from(derivedKey), Buffer.from(storedKey));
}

async function handleRegister(req, res, store, corsHeaders) {
  const body = await readJsonBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  const userName = String(body.userName || "").trim();
  const password = String(body.password || "");
  if (!email || !userName || password.length < 6) {
    json(
      res,
      400,
      { error: "Email, kullanıcı adı ve en az 6 karakter şifre gerekli." },
      corsHeaders
    );
    return;
  }

  const existingUser = await store.findUserByEmail(email);
  if (existingUser) {
    json(res, 409, { error: "Bu email ile kayıtlı kullanıcı var." }, corsHeaders);
    return;
  }

  const createdUser = await store.createUser({
    email,
    userName,
    passwordHash: hashPassword(password),
  });
  json(
    res,
    201,
    {
      ok: true,
      user: { email: createdUser.email, userName: createdUser.userName },
    },
    corsHeaders
  );
}

async function handleLogin(req, res, store, corsHeaders) {
  const body = await readJsonBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) {
    json(res, 400, { error: "Email ve şifre gerekli." }, corsHeaders);
    return;
  }

  const user = await store.findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    json(res, 401, { error: "Email veya şifre hatalı." }, corsHeaders);
    return;
  }

  json(
    res,
    200,
    { ok: true, user: { email: user.email, userName: user.userName } },
    corsHeaders
  );
}

function createHttpServer({ store, env }) {
  const server = createServer(async (req, res) => {
    const corsHeaders = buildCorsHeaders(req.headers.origin, env.allowedOrigins);
    if (req.method === "OPTIONS") {
      json(res, 204, {}, corsHeaders);
      return;
    }

    if (req.url === "/healthz") {
      json(res, 200, { status: "ok" }, corsHeaders);
      return;
    }

    if (req.url === "/__backend-signature") {
      json(
        res,
        200,
        {
          service: "dumbasscord-socket-backend",
          authRoutes: ["/auth/register", "/auth/login"],
          corsOrigins: env.allowedOrigins,
        },
        corsHeaders
      );
      return;
    }

    if (req.method === "POST" && req.url === "/auth/register") {
      try {
        await handleRegister(req, res, store, corsHeaders);
      } catch (error) {
        json(res, 500, { error: error.message || "Register failed" }, corsHeaders);
      }
      return;
    }

    if (req.method === "POST" && req.url === "/auth/login") {
      try {
        await handleLogin(req, res, store, corsHeaders);
      } catch (error) {
        json(res, 500, { error: error.message || "Login failed" }, corsHeaders);
      }
      return;
    }

    json(res, 404, { error: "Not found" }, corsHeaders);
  });

  return server;
}

module.exports = {
  createHttpServer,
};
