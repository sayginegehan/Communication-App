/* eslint-disable @typescript-eslint/no-require-imports */
const {
  joinRoomSchema,
  messageSchema,
  statusSchema,
  targetSchema,
  signalSchema,
  createServerSchema,
  createRoomSchema,
  typingSchema,
  roleChangeSchema,
  updateServerSettingsSchema,
  updateRoomSettingsSchema,
  parseOrThrow,
} = require("../validation/schemas");
const { getPrismaClient } = require("../lib/prisma");
const { verifyAuthToken } = require("../lib/jwt");

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

/** JsonStore uses `id`; PrismaStore uses `serverId`. */
function storeServerKey(server) {
  if (!server) {
    return "default";
  }
  return server.serverId || server.id || "default";
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
  const servers = (await store.listServers?.()) || [];
  const normalized = servers.map((server) => ({
    id: storeServerKey(server),
    name: server.name || storeServerKey(server),
    description: server.description || "",
    isDeleted: Boolean(server.deletedAt),
  }));

  const deduped = Array.from(new Map(normalized.map((s) => [s.id, s])).values());
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
  const rooms = (await store.listRoleMarkers?.()) || [];
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

function can(action, role) {
  const matrix = {
    owner: new Set([
      "server:update",
      "server:delete",
      "room:create",
      "room:update",
      "room:delete",
      "room:restore",
      "server:restore",
      "role:promote",
      "role:demote",
      "role:transfer",
    ]),
    admin: new Set([
      "server:update",
      "room:create",
      "room:update",
      "room:delete",
      "room:restore",
    ]),
    mod: new Set(["room:update"]),
    member: new Set([]),
  };
  return matrix[role || "member"]?.has(action) || false;
}

async function emitArchivedState(io, store, targetSocket = null) {
  const archivedServers = ((await store.listServers({ includeDeleted: true })) || [])
    .filter((server) => Boolean(server.deletedAt))
    .map((server) => ({
      id: storeServerKey(server),
      name: server.name || storeServerKey(server),
      description: server.description || "",
    }));

  const archivedRooms = ((await store.listRooms({ includeDeleted: true })) || [])
    .filter((room) => Boolean(room.deletedAt))
    .map((room) => ({
      serverId: room.serverId || "default",
      name: room.name || parsePersistedRoomId(room.roomId)?.roomName || room.roomId,
      topic: room.topic || "",
    }));

  if (targetSocket) {
    targetSocket.emit("archived-server-list", archivedServers);
    targetSocket.emit("archived-room-list", archivedRooms);
    return;
  }

  io.emit("archived-server-list", archivedServers);
  io.emit("archived-room-list", archivedRooms);
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

  const mergedRooms = persistedRooms.map((entry) => ({
    name: entry.name || parsePersistedRoomId(entry.roomId)?.roomName || entry.roomId,
    serverId: entry.serverId || parsePersistedRoomId(entry.roomId)?.serverId || "default",
    topic: entry.topic || "",
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
    await emitArchivedState(io, store, socket);

    socket.on("request-state", async () => {
      await emitServerList(io, store, socket);
      await emitRoomList(io, state, store, socket);
      await emitArchivedState(io, store, socket);
    });

    socket.on("join_channel", async ({ channelId }, ack) => {
      try {
        if (!channelId) throw new Error("channelId required");
        socket.join(`channel:${channelId}`);
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        if (typeof ack === "function") ack({ ok: false, error: error.message });
      }
    });

    socket.on("leave_channel", async ({ channelId }, ack) => {
      try {
        if (!channelId) throw new Error("channelId required");
        socket.leave(`channel:${channelId}`);
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        if (typeof ack === "function") ack({ ok: false, error: error.message });
      }
    });

    socket.on("typing_start", ({ channelId, username }) => {
      if (!channelId) return;
      socket.to(`channel:${channelId}`).emit("typing_start", { channelId, username });
    });

    socket.on("typing_stop", ({ channelId, username }) => {
      if (!channelId) return;
      socket.to(`channel:${channelId}`).emit("typing_stop", { channelId, username });
    });

    socket.on("send_message", async ({ channelId, content }, ack) => {
      try {
        if (!channelId || !content) throw new Error("channelId and content required");
        const prisma = getPrismaClient();
        const token = socket.handshake.auth?.token;
        if (!token) throw new Error("Auth token required");
        const decoded = verifyAuthToken(token);
        const membership = await prisma.serverMember.findFirst({
          where: {
            userId: decoded.sub,
            server: { channels: { some: { id: channelId } } },
          },
        });
        if (!membership) throw new Error("Not a member of this channel");
        const message = await prisma.channelMessage.create({
          data: { channelId, userId: decoded.sub, content },
          include: { user: { select: { id: true, username: true } } },
        });
        io.to(`channel:${channelId}`).emit("new_message", {
          id: message.id,
          channelId: message.channelId,
          content: message.content,
          createdAt: message.createdAt,
          user: message.user,
        });
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        if (typeof ack === "function") ack({ ok: false, error: error.message });
      }
    });

    socket.on("create-server", async (payload, ack) => {
      try {
        const { serverName, userName } = parseOrThrow(
          createServerSchema,
          payload,
          "create-server"
        );
        const serverId = normalizeServerId(serverName);
        await store.upsertServer(serverId, { name: serverName, description: "" });
        await store.touchRoom(buildRoleMarker(serverId, "owner", userName));
        await store.touchRoom(buildRoleMarker(serverId, "member", userName));
        await emitServerList(io, store);
        await emitRoomList(io, state, store);
        await emitArchivedState(io, store);
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
        if (normalizedServerId !== "default" && !can("room:create", role)) {
          throw new Error("Insufficient permission: only owner/admin can create rooms");
        }
        await store.upsertServer(normalizedServerId, { name: normalizedServerId });
        await store.upsertRoomSettings(buildPersistedRoomId(normalizedServerId, roomName), {
          name: roomName,
          topic: "",
        });
        await emitRoomList(io, state, store);
        await emitArchivedState(io, store);
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
        await store.upsertServer(normalizedServerId, { name: normalizedServerId });
        await store.touchRoom(buildRoleMarker(normalizedServerId, "member", userName));
        await store.upsertRoomSettings(persistedRoomId, { name: roomId });
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
        await emitArchivedState(io, store);
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
        if (!can("role:promote", actorRole)) {
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
        if (!can("role:demote", actorRole)) {
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
        if (!can("role:transfer", actorRole)) {
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

    socket.on("update-server-settings", async (payload, ack) => {
      try {
        const { serverId, actorUserName, name, description } = parseOrThrow(
          updateServerSettingsSchema,
          payload,
          "update-server-settings"
        );
        const normalizedServerId = normalizeServerId(serverId || "");
        const actorRole = await getUserRoleInServer(store, normalizedServerId, actorUserName || "");
        if (!can("server:update", actorRole)) {
          throw new Error("Insufficient permission for server update");
        }
        await store.upsertServer(normalizedServerId, { name, description });
        await emitServerList(io, store);
        await emitArchivedState(io, store);
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        if (typeof ack === "function") ack({ ok: false, error: error.message });
      }
    });

    socket.on("delete-server", async (payload, ack) => {
      try {
        const { serverId, actorUserName } = parseOrThrow(
          roleChangeSchema,
          payload,
          "delete-server"
        );
        const normalizedServerId = normalizeServerId(serverId || "");
        const actorRole = await getUserRoleInServer(store, normalizedServerId, actorUserName || "");
        if (!can("server:delete", actorRole)) {
          throw new Error("Insufficient permission for server delete");
        }
        await store.softDeleteServer(normalizedServerId);
        await emitServerList(io, store);
        await emitRoomList(io, state, store);
        await emitArchivedState(io, store);
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        if (typeof ack === "function") ack({ ok: false, error: error.message });
      }
    });

    socket.on("update-room-settings", async (payload, ack) => {
      try {
        const { serverId, roomName, actorUserName, name, topic } = parseOrThrow(
          updateRoomSettingsSchema,
          payload,
          "update-room-settings"
        );
        const normalizedServerId = normalizeServerId(serverId || "");
        const actorRole = await getUserRoleInServer(store, normalizedServerId, actorUserName || "");
        if (!can("room:update", actorRole)) {
          throw new Error("Insufficient permission for room update");
        }
        const roomId = buildPersistedRoomId(normalizedServerId, roomName);
        await store.upsertRoomSettings(roomId, { name, topic });
        await emitRoomList(io, state, store);
        await emitArchivedState(io, store);
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        if (typeof ack === "function") ack({ ok: false, error: error.message });
      }
    });

    socket.on("delete-room", async (payload, ack) => {
      try {
        const { serverId, roomName, actorUserName } = parseOrThrow(
          updateRoomSettingsSchema.pick({ serverId: true, roomName: true, actorUserName: true }),
          payload,
          "delete-room"
        );
        const normalizedServerId = normalizeServerId(serverId || "");
        const actorRole = await getUserRoleInServer(store, normalizedServerId, actorUserName || "");
        if (!can("room:delete", actorRole)) {
          throw new Error("Insufficient permission for room delete");
        }
        const roomId = buildPersistedRoomId(normalizedServerId, roomName);
        await store.upsertRoomSettings(roomId, { deletedAt: new Date() });
        await emitRoomList(io, state, store);
        await emitArchivedState(io, store);
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        if (typeof ack === "function") ack({ ok: false, error: error.message });
      }
    });

    socket.on("restore-server", async (payload, ack) => {
      try {
        const { serverId, actorUserName } = parseOrThrow(
          roleChangeSchema,
          payload,
          "restore-server"
        );
        const normalizedServerId = normalizeServerId(serverId);
        const actorRole = await getUserRoleInServer(store, normalizedServerId, actorUserName);
        if (!can("server:restore", actorRole)) {
          throw new Error("Insufficient permission for server restore");
        }
        await store.upsertServer(normalizedServerId, { deletedAt: null });
        const allRooms = await store.listRooms({ includeDeleted: true });
        for (const room of allRooms) {
          if (room.serverId === normalizedServerId && room.deletedAt) {
            await store.upsertRoomSettings(room.roomId, { deletedAt: null });
          }
        }
        await emitServerList(io, store);
        await emitRoomList(io, state, store);
        await emitArchivedState(io, store);
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        if (typeof ack === "function") ack({ ok: false, error: error.message });
      }
    });

    socket.on("restore-room", async (payload, ack) => {
      try {
        const { serverId, roomName, actorUserName } = parseOrThrow(
          updateRoomSettingsSchema.pick({ serverId: true, roomName: true, actorUserName: true }),
          payload,
          "restore-room"
        );
        const normalizedServerId = normalizeServerId(serverId);
        const actorRole = await getUserRoleInServer(store, normalizedServerId, actorUserName);
        if (!can("room:restore", actorRole)) {
          throw new Error("Insufficient permission for room restore");
        }
        const roomId = buildPersistedRoomId(normalizedServerId, roomName);
        await store.upsertRoomSettings(roomId, { deletedAt: null });
        await emitRoomList(io, state, store);
        await emitArchivedState(io, store);
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        if (typeof ack === "function") ack({ ok: false, error: error.message });
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
