/* eslint-disable @typescript-eslint/no-require-imports */
const { z } = require("zod");
const { JWT_COOKIE_NAME, signAuthToken } = require("../../lib/jwt");
const authService = require("./auth.service");

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(2).max(30).optional(),
  userName: z.string().min(2).max(30).optional(),
  password: z.string().min(6).max(128),
}).refine((payload) => Boolean(payload.username || payload.userName), {
  message: "username or userName is required",
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function setAuthCookie(res, token) {
  res.cookie(JWT_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(JWT_COOKIE_NAME, {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

function toAuthResponseUser(user) {
  return {
    id: user.id,
    email: user.email,
    userName: user.userName,
  };
}

function statusFromError(error) {
  if (error && typeof error.statusCode === "number") {
    return error.statusCode;
  }
  return 400;
}

async function register(req, res) {
  try {
    const payload = registerSchema.parse(req.body);
    const user = await authService.register({
      email: payload.email,
      userName: payload.userName || payload.username,
      password: payload.password,
    });
    const token = signAuthToken({
      sub: user.id,
      email: user.email,
      userName: user.userName,
    });
    setAuthCookie(res, token);
    res.status(201).json({ user: toAuthResponseUser(user), token });
  } catch (error) {
    res.status(statusFromError(error)).json({ error: error.message });
  }
}

async function login(req, res) {
  try {
    const payload = loginSchema.parse(req.body);
    const user = await authService.login(payload);
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = signAuthToken({
      sub: user.id,
      email: user.email,
      userName: user.userName,
    });
    setAuthCookie(res, token);
    res.json({ user: toAuthResponseUser(user), token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

async function me(req, res) {
  const user = await authService.getMe(req.auth.sub);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user: toAuthResponseUser(user) });
}

async function refresh(req, res) {
  const user = await authService.getMe(req.auth.sub);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = signAuthToken({
    sub: user.id,
    email: user.email,
    userName: user.userName,
  });
  setAuthCookie(res, token);
  res.json({ user: toAuthResponseUser(user), token });
}

function logout(_req, res) {
  clearAuthCookie(res);
  res.json({ ok: true });
}

module.exports = {
  register,
  login,
  me,
  refresh,
  logout,
};
