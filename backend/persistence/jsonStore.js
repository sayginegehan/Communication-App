/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

function defaultStore() {
  return {
    rooms: {},
    servers: {},
    roomSettings: {},
  };
}

class JsonStore {
  constructor(filePath) {
    this.kind = "json";
    this.filePath = path.resolve(filePath);
    this.data = defaultStore();
    this.ensureFile();
    this.load();
  }

  ensureFile() {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });

    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(
        this.filePath,
        JSON.stringify(defaultStore(), null, 2),
        "utf-8"
      );
    }
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      this.data = parsed && typeof parsed === "object" ? parsed : defaultStore();
      if (!this.data.rooms || typeof this.data.rooms !== "object") {
        this.data.rooms = {};
      }
      if (!this.data.servers || typeof this.data.servers !== "object") {
        this.data.servers = {};
      }
      if (!this.data.roomSettings || typeof this.data.roomSettings !== "object") {
        this.data.roomSettings = {};
      }
    } catch {
      this.data = defaultStore();
      this.flush();
    }
  }

  flush() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  ensureRoom(roomId) {
    if (!this.data.rooms[roomId]) {
      this.data.rooms[roomId] = {
        roomId,
        messages: [],
        events: [],
      };
    }

    return this.data.rooms[roomId];
  }

  ensureServer(serverId, name = serverId) {
    if (!this.data.servers[serverId]) {
      this.data.servers[serverId] = {
        id: serverId,
        name,
        description: "",
        deletedAt: null,
      };
    }
    return this.data.servers[serverId];
  }

  async appendMessage(roomId, message) {
    const room = this.ensureRoom(roomId);
    room.messages.push(message);
    if (room.messages.length > 200) {
      room.messages = room.messages.slice(-200);
    }
    this.flush();
  }

  async appendEvent(roomId, event) {
    const room = this.ensureRoom(roomId);
    room.events.push(event);
    if (room.events.length > 300) {
      room.events = room.events.slice(-300);
    }
    this.flush();
  }

  async getRecentMessages(roomId, limit = 50) {
    const room = this.ensureRoom(roomId);
    return room.messages.slice(-limit);
  }

  async touchRoom(roomId) {
    this.ensureRoom(roomId);
    this.flush();
  }

  async upsertServer(serverId, data = {}) {
    const server = this.ensureServer(serverId, data.name || serverId);
    if (typeof data.name === "string") server.name = data.name;
    if (typeof data.description === "string") server.description = data.description;
    if (Object.prototype.hasOwnProperty.call(data, "deletedAt")) {
      server.deletedAt = data.deletedAt;
    }
    this.flush();
    return server;
  }

  async upsertRoomSettings(roomId, data = {}) {
    if (!this.data.roomSettings[roomId]) {
      this.data.roomSettings[roomId] = {
        name: roomId.split("::").slice(1).join("::") || roomId,
        topic: "",
        deletedAt: null,
      };
    }
    const settings = this.data.roomSettings[roomId];
    if (typeof data.name === "string") settings.name = data.name;
    if (typeof data.topic === "string") settings.topic = data.topic;
    if (Object.prototype.hasOwnProperty.call(data, "deletedAt")) {
      settings.deletedAt = data.deletedAt;
    }
    this.flush();
    return settings;
  }

  async listServers({ includeDeleted = false } = {}) {
    return Object.values(this.data.servers).filter(
      (server) => includeDeleted || !server.deletedAt
    );
  }

  async listRooms({ includeDeleted = false } = {}) {
    const result = [];
    for (const roomId of Object.keys(this.data.rooms)) {
      if (roomId.startsWith("__")) {
        continue;
      }
      const splitIndex = roomId.indexOf("::");
      const serverId = splitIndex === -1 ? "default" : roomId.slice(0, splitIndex);
      const fallbackName = splitIndex === -1 ? roomId : roomId.slice(splitIndex + 2);
      const settings = this.data.roomSettings[roomId] || {
        name: fallbackName,
        topic: "",
        deletedAt: null,
      };
      if (!includeDeleted && settings.deletedAt) {
        continue;
      }
      result.push({
        roomId,
        serverId,
        name: settings.name || fallbackName,
        topic: settings.topic || "",
        deletedAt: settings.deletedAt || null,
      });
    }
    return result;
  }

  async listRoleMarkers() {
    return Object.keys(this.data.rooms)
      .filter((roomId) => roomId.startsWith("__role__:"))
      .map((roomId) => ({ roomId }));
  }

  async softDeleteServer(serverId) {
    await this.upsertServer(serverId, { deletedAt: new Date().toISOString() });
    for (const roomId of Object.keys(this.data.rooms)) {
      if (roomId.startsWith(`${serverId}::`)) {
        await this.upsertRoomSettings(roomId, { deletedAt: new Date().toISOString() });
      }
    }
  }

  async deleteRoom(roomId) {
    delete this.data.rooms[roomId];
    this.flush();
  }

  async close() {}
}

module.exports = {
  JsonStore,
};
