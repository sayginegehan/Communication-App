/* eslint-disable @typescript-eslint/no-require-imports */
const { Server } = require("socket.io");
const { createHttpServer } = require("./http/createHttpServer");
const { createStore } = require("./persistence/createStore");
const { registerSocketHandlers } = require("./socket/registerSocketHandlers");
const { MemoryState } = require("./state/memoryState");

async function createRealtimeServer(env) {
  const state = new MemoryState();
  const store = await createStore(env);
  const httpServer = createHttpServer({ store, env });
  const io = new Server(httpServer, {
    path: env.socketPath,
    cors: {
      origin: env.corsOriginValidator,
      methods: ["GET", "POST", "OPTIONS"],
      credentials: true,
    },
  });

  registerSocketHandlers(io, { state, store, env });

  return {
    httpServer,
    io,
    store,
    storeKind: store.kind || "unknown",
  };
}

module.exports = {
  createRealtimeServer,
};
