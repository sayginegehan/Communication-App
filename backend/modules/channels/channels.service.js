/* eslint-disable @typescript-eslint/no-require-imports */
const { getPrismaClient } = require("../../lib/prisma");

async function createChannel({ serverId, name, type = "text", userId }) {
  const prisma = getPrismaClient();
  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId } },
  });
  if (!membership || !["owner", "admin", "mod"].includes(membership.role)) {
    throw new Error("Insufficient permission");
  }
  return prisma.channel.create({ data: { serverId, name, type } });
}

async function listChannels(serverId, userId) {
  const prisma = getPrismaClient();
  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId } },
  });
  if (!membership) throw new Error("Not a member");
  return prisma.channel.findMany({ where: { serverId }, orderBy: { createdAt: "asc" } });
}

module.exports = {
  createChannel,
  listChannels,
};
