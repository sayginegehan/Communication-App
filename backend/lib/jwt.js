/* eslint-disable @typescript-eslint/no-require-imports */
const jwt = require("jsonwebtoken");

const JWT_COOKIE_NAME = "dumbasscord_token";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET || "";
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production");
  }
  return secret || "dev-secret";
}

function signAuthToken(payload) {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, {
    expiresIn: "7d",
    issuer: "dumbasscord-backend",
  });
}

function verifyAuthToken(token) {
  const secret = getJwtSecret();
  return jwt.verify(token, secret, {
    issuer: "dumbasscord-backend",
  });
}

module.exports = {
  JWT_COOKIE_NAME,
  signAuthToken,
  verifyAuthToken,
};
