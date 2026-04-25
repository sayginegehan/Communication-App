/* eslint-disable @typescript-eslint/no-require-imports */
const { getPrismaClient } = require("../../lib/prisma");

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

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

async function deleteChannel({ channelId, userId }) {
  const prisma = getPrismaClient();
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      serverId: true,
    },
  });
  if (!channel) {
    throw createError("Channel not found", 404);
  }

  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: channel.serverId } },
  });
  if (!membership) {
    throw createError("Not a member", 403);
  }
  if (!["owner", "admin"].includes(membership.role)) {
    throw createError("Only owner/admin can delete channels", 403);
  }

  await prisma.channel.delete({
    where: { id: channelId },
  });
}

module.exports = {
  createChannel,
  listChannels,
  deleteChannel,
};
