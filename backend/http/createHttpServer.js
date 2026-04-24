/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require("http");
const { createApp } = require("./createApp");

function createHttpServer() {
  const app = createApp();
  return createServer(app);
}

module.exports = {
  createHttpServer,
};
