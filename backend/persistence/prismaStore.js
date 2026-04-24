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
    await this.prisma.room.upsert({
      where: { roomId },
      update: {},
      create: { roomId },
    });
  }

  async listRooms() {
    return this.prisma.room.findMany({
      select: { roomId: true },
      orderBy: { createdAt: "asc" },
    });
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
