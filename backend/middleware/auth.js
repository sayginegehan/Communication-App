/* eslint-disable @typescript-eslint/no-require-imports */
const { JWT_COOKIE_NAME, verifyAuthToken } = require("../lib/jwt");

function requireAuth(req, res, next) {
  try {
    const headerToken = req.headers.authorization?.replace("Bearer ", "");
    const cookieToken = req.cookies?.[JWT_COOKIE_NAME];
    const token = headerToken || cookieToken;
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.auth = verifyAuthToken(token);
    next();
  } catch (_error) {
    res.status(401).json({ error: "Unauthorized" });
  }
}

module.exports = {
  requireAuth,
};
