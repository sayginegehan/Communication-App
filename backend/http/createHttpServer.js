/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require("http");
const { createApp } = require("./createApp");

function createHttpServer({ env }) {
  const app = createApp({ env });
  return createServer(app);
}

module.exports = {
  createHttpServer,
};
