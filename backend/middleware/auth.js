/* eslint-disable @typescript-eslint/no-require-imports */
const { JWT_COOKIE_NAME, verifyAuthToken } = require("../lib/jwt");

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const headerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const cookieToken = req.cookies?.[JWT_COOKIE_NAME];
    const token = headerToken || cookieToken;
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.auth = verifyAuthToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

module.exports = {
  requireAuth,
};
