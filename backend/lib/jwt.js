/* eslint-disable @typescript-eslint/no-require-imports */
const jwt = require("jsonwebtoken");

const JWT_COOKIE_NAME = "dumbasscord_token";

function signAuthToken(payload) {
  const secret = process.env.JWT_SECRET || "dev-secret";
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

function verifyAuthToken(token) {
  const secret = process.env.JWT_SECRET || "dev-secret";
  return jwt.verify(token, secret);
}

module.exports = {
  JWT_COOKIE_NAME,
  signAuthToken,
  verifyAuthToken,
};
