/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");

class PrismaStore {
  constructor(databaseUrl) {
    this.kind = "prisma";
    this.prisma = new PrismaClient({
      datasources: {
        db: { url: databaseUrl },
      },
    });
  }

  async appendMessage(roomId, message) {
    await this.touchRoom(roomId);

    await this.prisma.message.create({
      data: {
        roomId,
        externalId: String(message.id),
        sender: message.sender,
        text: message.text,
        sentAt: new Date(),
      },
    });
  }

  async appendEvent(roomId, event) {
    await this.touchRoom(roomId);

    await this.prisma.roomEvent.create({
      data: {
        roomId,
        type: event.type,
        socketId: event.socketId,
        userName: event.userName || null,
      },
    });
  }

  async getRecentMessages(roomId, limit = 50) {
    const rows = await this.prisma.message.findMany({
      where: { roomId },
      orderBy: { sentAt: "desc" },
      take: limit,
    });

    return rows
      .reverse()
      .map((row) => ({
        id: Number(row.externalId) || Date.now(),
        sender: row.sender,
        text: row.text,
        time: new Date(row.sentAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));
  }

  async touchRoom(roomId) {
    const splitIndex = roomId.indexOf("::");
    const serverId = splitIndex === -1 ? "default" : roomId.slice(0, splitIndex);
    const roomName = splitIndex === -1 ? roomId : roomId.slice(splitIndex + 2);
    await this.prisma.room.upsert({
      where: { roomId },
      update: {
        type: roomId.startsWith("__") ? "meta" : "room",
        serverId,
        name: roomName,
      },
      create: {
        roomId,
        type: roomId.startsWith("__") ? "meta" : "room",
        serverId,
        name: roomName,
      },
    });
  }

  async upsertServer(serverId, data = {}) {
    const roomId = `__server__:${serverId}`;
    return this.prisma.room.upsert({
      where: { roomId },
      update: {
        type: "server",
        serverId,
        name: data.name || serverId,
        description: data.description || "",
        deletedAt: Object.prototype.hasOwnProperty.call(data, "deletedAt")
          ? data.deletedAt
          : undefined,
      },
      create: {
        roomId,
        type: "server",
        serverId,
        name: data.name || serverId,
        description: data.description || "",
        deletedAt: Object.prototype.hasOwnProperty.call(data, "deletedAt")
          ? data.deletedAt
          : null,
      },
    });
  }

  async upsertRoomSettings(roomId, data = {}) {
    const splitIndex = roomId.indexOf("::");
    const serverId = splitIndex === -1 ? "default" : roomId.slice(0, splitIndex);
    const roomName = splitIndex === -1 ? roomId : roomId.slice(splitIndex + 2);
    return this.prisma.room.upsert({
      where: { roomId },
      update: {
        type: "room",
        serverId,
        name: data.name || roomName,
        topic: data.topic || "",
        deletedAt: Object.prototype.hasOwnProperty.call(data, "deletedAt")
          ? data.deletedAt
          : undefined,
      },
      create: {
        roomId,
        type: "room",
        serverId,
        name: data.name || roomName,
        topic: data.topic || "",
        deletedAt: Object.prototype.hasOwnProperty.call(data, "deletedAt")
          ? data.deletedAt
          : null,
      },
    });
  }

  async listServers({ includeDeleted = false } = {}) {
    return this.prisma.room.findMany({
      where: {
        type: "server",
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      select: {
        serverId: true,
        name: true,
        description: true,
        deletedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async listRooms({ includeDeleted = false } = {}) {
    return this.prisma.room.findMany({
      where: {
        type: "room",
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      select: {
        roomId: true,
        serverId: true,
        name: true,
        topic: true,
        deletedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async listRoleMarkers() {
    return this.prisma.room.findMany({
      where: {
        type: "meta",
        roomId: {
          startsWith: "__role__:",
        },
      },
      select: { roomId: true },
    });
  }

  async softDeleteServer(serverId) {
    await this.prisma.room.updateMany({
      where: { serverId },
      data: { deletedAt: new Date() },
    });
    await this.upsertServer(serverId, { deletedAt: new Date() });
  }

  async deleteRoom(roomId) {
    await this.prisma.room.deleteMany({
      where: { roomId },
    });
  }

  async close() {
    await this.prisma.$disconnect();
  }
}

module.exports = {
  PrismaStore,
};
