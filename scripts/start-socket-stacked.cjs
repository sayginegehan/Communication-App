/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Used with `npm start` (Next + socket together). Next.js binds PORT from the
 * platform; socket must use another port to avoid EADDRINUSE.
 */
require("dotenv").config();
if (!process.env.SOCKET_PORT || String(process.env.SOCKET_PORT).trim() === "") {
  process.env.SOCKET_PORT = "3001";
}
require("../server.js");
