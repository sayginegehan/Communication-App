/* eslint-disable @typescript-eslint/no-require-imports */
const {
  joinRoomSchema,
  messageSchema,
  statusSchema,
  targetSchema,
  signalSchema,
  createServerSchema,
  createRoomSchema,
  deleteRoomSchema,
  typingSchema,
  roleChangeSchema,
  parseOrThrow,
} = require("../validation/schemas");

function buildChatMessage(user, text) {
  return {
    id: Date.now(),
    sender: user.name,
    text,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
}

function normalizeServerId(value) {
  return value.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-");
}

function buildServerMarker(serverId) {
  return `__server__:${serverId}`;
}

function buildRoleMarker(serverId, role, userName) {
  return `__role__:${serverId}::${role}::${userName.toLowerCase()}`;
}

function parseRoleMarker(roomId) {
  if (!roomId.startsWith("__role__:")) {
    return null;
  }
  const body = roomId.replace("__role__:", "");
  const parts = body.split("::");
  if (parts.length !== 3) {
    return null;
  }
  return {
    serverId: parts[0],
    role: parts[1],
    userName: parts[2],
  };
}

function buildPersistedRoomId(serverId, roomName) {
  return `${serverId}::${roomName}`;
}

function parsePersistedRoomId(persistedRoomId) {
  if (
    persistedRoomId.startsWith("__server__:") ||
    persistedRoomId.startsWith("__role__:")
  ) {
    return null;
  }

  const splitIndex = persistedRoomId.indexOf("::");
  if (splitIndex === -1) {
    return { serverId: "default", roomName: persistedRoomId };
  }
  return {
    serverId: persistedRoomId.slice(0, splitIndex),
    roomName: persistedRoomId.slice(splitIndex + 2),
  };
}

async function emitServerList(io, store, targetSocket = null) {
  const rooms = await store.listRooms();
  const servers = rooms
    .map(({ roomId }) => roomId)
    .filter((roomId) => roomId.startsWith("__server__:"))
    .map((roomId) => {
      const serverId = roomId.replace("__server__:", "");
      return { id: serverId, name: serverId };
    });

  const deduped = Array.from(new Map(servers.map((s) => [s.id, s])).values());
  if (!deduped.some((server) => server.id === "default")) {
    deduped.unshift({ id: "default", name: "default" });
  }

  if (targetSocket) {
    targetSocket.emit("server-list", deduped);
    return;
  }
  io.emit("server-list", deduped);
}

async function getUserRoleInServer(store, serverId, userName) {
  const rooms = await store.listRooms();
  const normalizedUser = userName.toLowerCase();
  const markers = rooms
    .map(({ roomId }) => parseRoleMarker(roomId))
    .filter(Boolean)
    .filter((marker) => marker.serverId === serverId && marker.userName === normalizedUser);

  if (markers.some((marker) => marker.role === "owner")) {
    return "owner";
  }
  if (markers.some((marker) => marker.role === "admin")) {
    return "admin";
  }
  if (markers.some((marker) => marker.role === "member")) {
    return "member";
  }
  return null;
}

async function setUserRoleInServer(store, serverId, userName, role) {
  await store.touchRoom(buildRoleMarker(serverId, "member", userName));
  await store.deleteRoom(buildRoleMarker(serverId, "owner", userName));
  await store.deleteRoom(buildRoleMarker(serverId, "admin", userName));
  if (role === "owner") {
    await store.touchRoom(buildRoleMarker(serverId, "owner", userName));
    return;
  }
  if (role === "admin") {
    await store.touchRoom(buildRoleMarker(serverId, "admin", userName));
  }
}

async function emitRoomList(io, state, store, targetSocket = null) {
  const onlineCounts = new Map(
    state.getRoomCountList().map((room) => [room.name, room.count])
  );
  const persistedRooms = await store.listRooms();

  const mergedRooms = persistedRooms
    .map(({ roomId }) => ({ roomId, parsed: parsePersistedRoomId(roomId) }))
    .filter((entry) => entry.parsed !== null)
    .map((entry) => ({
      name: entry.parsed.roomName,
      serverId: entry.parsed.serverId,
      count: onlineCounts.get(entry.roomId) || 0,
    }));

  for (const [name, count] of onlineCounts.entries()) {
    const parsed = parsePersistedRoomId(name);
    if (!parsed) {
      continue;
    }
    if (
      !mergedRooms.some(
        (room) => room.name === parsed.roomName && room.serverId === parsed.serverId
      )
    ) {
      mergedRooms.push({ name: parsed.roomName, serverId: parsed.serverId, count });
    }
  }

  if (targetSocket) {
    targetSocket.emit("room-list", mergedRooms);
    return;
  }

  io.emit("room-list", mergedRooms);
}

function emitUserList(io, state, roomId) {
  io.to(roomId).emit("user-list", state.getRoomUsers(roomId));
}

function authSocket(socket, serverToken) {
  if (!serverToken) {
    return true;
  }
  const providedToken = socket.handshake.auth?.token;
  return providedToken && providedToken === serverToken;
}

function registerSocketHandlers(io, { state, store, env }) {
  io.use((socket, next) => {
    if (!authSocket(socket, env.serverAuthToken)) {
      next(new Error("Unauthorized socket connection"));
      return;
    }
    next();
  });

  io.on("connection", async (socket) => {
    await emitServerList(io, store, socket);
    await emitRoomList(io, state, store, socket);

    socket.on("request-state", async () => {
      await emitServerList(io, store, socket);
      await emitRoomList(io, state, store, socket);
    });

    socket.on("create-server", async (payload, ack) => {
      try {
        const { serverName, userName } = parseOrThrow(
          createServerSchema,
          payload,
          "create-server"
        );
        const serverId = normalizeServerId(serverName);
        await store.touchRoom(buildServerMarker(serverId));
        await store.touchRoom(buildRoleMarker(serverId, "owner", userName));
        await store.touchRoom(buildRoleMarker(serverId, "member", userName));
        await emitServerList(io, store);
        await emitRoomList(io, state, store);
        if (typeof ack === "function") {
          ack({ ok: true, serverId });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("create-room", async (payload, ack) => {
      try {
        const { serverId, roomName, userName } = parseOrThrow(
          createRoomSchema,
          payload,
          "create-room"
        );
        const normalizedServerId = normalizeServerId(serverId);
        const role = await getUserRoleInServer(store, normalizedServerId, userName);
        if (normalizedServerId !== "default" && !["owner", "admin"].includes(role || "")) {
          throw new Error("Insufficient permission: only owner/admin can create rooms");
        }
        await store.touchRoom(buildServerMarker(normalizedServerId));
        await store.touchRoom(buildPersistedRoomId(normalizedServerId, roomName));
        await emitRoomList(io, state, store);
        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("delete-room", async (payload, ack) => {
      try {
        const { serverId, roomName, userName } = parseOrThrow(
          deleteRoomSchema,
          payload,
          "delete-room"
        );
        const normalizedServerId = normalizeServerId(serverId);
        const role = await getUserRoleInServer(store, normalizedServerId, userName);
        if (normalizedServerId !== "default" && !["owner", "admin"].includes(role || "")) {
          throw new Error("Insufficient permission: only owner/admin can delete rooms");
        }
        const persistedRoomId = buildPersistedRoomId(normalizedServerId, roomName);
        await store.deleteRoom(persistedRoomId);

        // Kapatilan odadaki kullanicilari cikar ve fallback olarak sunucu odasina tasi.
        const fallbackRoomId = buildPersistedRoomId(normalizedServerId, "genel");
        await store.touchRoom(fallbackRoomId);
        const roomUsers = state.getRoomUsers(persistedRoomId);
        for (const u of roomUsers) {
          const targetSocket = io.sockets.sockets.get(u.id);
          if (!targetSocket) {
            continue;
          }
          targetSocket.leave(persistedRoomId);
          targetSocket.join(fallbackRoomId);
          state.upsertUser(u.id, {
            ...u,
            room: fallbackRoomId,
            roomName: "genel",
          });
          targetSocket.emit("room-deleted", { roomName, fallbackRoomName: "genel" });
        }

        await emitRoomList(io, state, store);
        emitUserList(io, state, fallbackRoomId);
        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("join-room", async (payload, ack) => {
      try {
        const { roomId, userName, serverId = "default" } = parseOrThrow(
          joinRoomSchema,
          payload,
          "join-room"
        );
        const normalizedServerId = normalizeServerId(serverId);
        const persistedRoomId = buildPersistedRoomId(normalizedServerId, roomId);
        const oldUser = state.getUser(socket.id);
        const oldRoom = oldUser?.room;
        if (oldRoom) {
          socket.leave(oldRoom);
          await store.appendEvent(oldRoom, {
            type: "leave",
            socketId: socket.id,
            userName: oldUser?.name || userName,
            at: Date.now(),
          });
        }

        socket.join(persistedRoomId);
        await store.touchRoom(buildServerMarker(normalizedServerId));
        await store.touchRoom(buildRoleMarker(normalizedServerId, "member", userName));
        await store.touchRoom(persistedRoomId);
        const role = await getUserRoleInServer(store, normalizedServerId, userName);
        state.upsertUser(socket.id, {
          id: socket.id,
          name: userName,
          room: persistedRoomId,
          serverId: normalizedServerId,
          roomName: roomId,
          role: role || "member",
          isSpeaking: false,
          isMuted: false,
          isSharingScreen: false,
        });

        await store.appendEvent(persistedRoomId, {
          type: "join",
          socketId: socket.id,
          userName,
          at: Date.now(),
        });

        socket.emit("message-history", await store.getRecentMessages(persistedRoomId, 50));
        socket.to(persistedRoomId).emit("user-joined", socket.id);
        await emitServerList(io, store);
        await emitRoomList(io, state, store);
        emitUserList(io, state, persistedRoomId);
        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("promote-user", async (payload, ack) => {
      try {
        const { serverId, actorUserName, targetUserName } = parseOrThrow(
          roleChangeSchema,
          payload,
          "promote-user"
        );
        const normalizedServerId = normalizeServerId(serverId);
        const actorRole = await getUserRoleInServer(store, normalizedServerId, actorUserName);
        const targetRole = await getUserRoleInServer(store, normalizedServerId, targetUserName);
        if (actorRole !== "owner") {
          throw new Error("Only owner can promote members");
        }
        if (targetRole === "owner") {
          throw new Error("Owner role cannot be changed");
        }
        await setUserRoleInServer(store, normalizedServerId, targetUserName, "admin");
        state.updateRoleForUser(normalizedServerId, targetUserName, "admin");
        const actorUser = state
          .listUsers()
          .find(
            (u) =>
              u.serverId === normalizedServerId &&
              typeof u.name === "string" &&
              u.name.toLowerCase() === actorUserName.toLowerCase()
          );
        if (actorUser?.room) {
          emitUserList(io, state, actorUser.room);
        }
        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("demote-user", async (payload, ack) => {
      try {
        const { serverId, actorUserName, targetUserName } = parseOrThrow(
          roleChangeSchema,
          payload,
          "demote-user"
        );
        const normalizedServerId = normalizeServerId(serverId);
        const actorRole = await getUserRoleInServer(store, normalizedServerId, actorUserName);
        const targetRole = await getUserRoleInServer(store, normalizedServerId, targetUserName);
        if (actorRole !== "owner") {
          throw new Error("Only owner can demote admins");
        }
        if (targetRole === "owner") {
          throw new Error("Owner role cannot be changed");
        }
        await setUserRoleInServer(store, normalizedServerId, targetUserName, "member");
        state.updateRoleForUser(normalizedServerId, targetUserName, "member");
        const actorUser = state
          .listUsers()
          .find(
            (u) =>
              u.serverId === normalizedServerId &&
              typeof u.name === "string" &&
              u.name.toLowerCase() === actorUserName.toLowerCase()
          );
        if (actorUser?.room) {
          emitUserList(io, state, actorUser.room);
        }
        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("transfer-owner", async (payload, ack) => {
      try {
        const { serverId, actorUserName, targetUserName } = parseOrThrow(
          roleChangeSchema,
          payload,
          "transfer-owner"
        );
        const normalizedServerId = normalizeServerId(serverId);
        const actorRole = await getUserRoleInServer(store, normalizedServerId, actorUserName);
        const targetRole = await getUserRoleInServer(store, normalizedServerId, targetUserName);
        if (actorRole !== "owner") {
          throw new Error("Only owner can transfer ownership");
        }
        if (!targetRole) {
          throw new Error("Target user is not a server member");
        }

        await setUserRoleInServer(store, normalizedServerId, actorUserName, "admin");
        await setUserRoleInServer(store, normalizedServerId, targetUserName, "owner");
        state.updateRoleForUser(normalizedServerId, actorUserName, "admin");
        state.updateRoleForUser(normalizedServerId, targetUserName, "owner");

        const sameServerUsers = state
          .listUsers()
          .filter((u) => u.serverId === normalizedServerId);
        const rooms = Array.from(new Set(sameServerUsers.map((u) => u.room).filter(Boolean)));
        for (const roomId of rooms) {
          emitUserList(io, state, roomId);
        }

        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("mute-status", (payload, ack) => {
      try {
        const status = parseOrThrow(statusSchema, payload, "mute-status");
        const user = state.getUser(socket.id);
        if (!user?.room) {
          throw new Error("User not in room");
        }
        user.isMuted = status;
        emitUserList(io, state, user.room);
        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("speaking-status", (payload) => {
      try {
        const status = parseOrThrow(statusSchema, payload, "speaking-status");
        const user = state.getUser(socket.id);
        if (!user?.room) {
          return;
        }
        user.isSpeaking = status;
        emitUserList(io, state, user.room);
      } catch {}
    });

    socket.on("share-screen-status", (payload, ack) => {
      try {
        const status = parseOrThrow(statusSchema, payload, "share-screen-status");
        const user = state.getUser(socket.id);
        if (!user?.room) {
          throw new Error("User not in room");
        }
        user.isSharingScreen = status;
        emitUserList(io, state, user.room);
        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("send-message", async (payload, ack) => {
      try {
        const parsed = parseOrThrow(messageSchema, payload, "send-message");
        const user = state.getUser(socket.id);
        if (!user?.room) {
          throw new Error("User not in room");
        }
        const message = buildChatMessage(user, parsed.text);
        await store.appendMessage(user.room, message);
        io.to(user.room).emit("receive-message", message);
        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("typing-status", (payload) => {
      try {
        const parsed = parseOrThrow(typingSchema, payload, "typing-status");
        const normalizedServerId = normalizeServerId(parsed.serverId || "default");
        const persistedRoomId = buildPersistedRoomId(normalizedServerId, parsed.roomId);
        const user = state.getUser(socket.id);
        if (!user?.room || user.room !== persistedRoomId) {
          return;
        }
        socket.to(user.room).emit("typing-status", {
          userName: parsed.userName,
          isTyping: parsed.isTyping,
        });
      } catch {}
    });

    socket.on("send-nudge", (targetId, ack) => {
      try {
        const user = state.getUser(socket.id);
        if (!user?.room) {
          throw new Error("User not in room");
        }

        if (targetId) {
          const parsedTarget = parseOrThrow(targetSchema, targetId, "send-nudge");
          if (!state.isInSameRoom(socket.id, parsedTarget)) {
            throw new Error("Target is not in your room");
          }
          io.to(parsedTarget).emit("receive-nudge");
        } else {
          // "Dürt! (Herkesi)" butonunun backend davranışı
          socket.to(user.room).emit("receive-nudge");
        }

        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("offer", ({ offer, to }, ack) => {
      try {
        const parsed = parseOrThrow(signalSchema, { to }, "offer");
        if (!state.isInSameRoom(socket.id, parsed.to)) {
          throw new Error("Signal target is not in your room");
        }
        socket.to(parsed.to).emit("offer", { offer, from: socket.id });
        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("answer", ({ answer, to }, ack) => {
      try {
        const parsed = parseOrThrow(signalSchema, { to }, "answer");
        if (!state.isInSameRoom(socket.id, parsed.to)) {
          throw new Error("Signal target is not in your room");
        }
        socket.to(parsed.to).emit("answer", { answer, from: socket.id });
        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("ice-candidate", ({ candidate, to }, ack) => {
      try {
        const parsed = parseOrThrow(signalSchema, { to }, "ice-candidate");
        if (!state.isInSameRoom(socket.id, parsed.to)) {
          throw new Error("Signal target is not in your room");
        }
        socket.to(parsed.to).emit("ice-candidate", { candidate, from: socket.id });
        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("disconnect", async () => {
      const user = state.deleteUser(socket.id);
      if (!user?.room) {
        return;
      }

      await store.appendEvent(user.room, {
        type: "disconnect",
        socketId: socket.id,
        userName: user.name,
        at: Date.now(),
      });

      socket.to(user.room).emit("user-left", socket.id);
      await emitRoomList(io, state, store);
      emitUserList(io, state, user.room);
    });
  });
}

module.exports = {
  registerSocketHandlers,
};
