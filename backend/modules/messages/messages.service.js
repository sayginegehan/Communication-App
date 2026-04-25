/* eslint-disable @typescript-eslint/no-require-imports */
const { getPrismaClient } = require("../../lib/prisma");

async function createMessage({ channelId, userId, content }) {
  const prisma = getPrismaClient();
  return prisma.channelMessage.create({
    data: { channelId, userId, content },
    include: { user: { select: { id: true, username: true } } },
  });
}

async function listMessages(channelId, userId) {
  const prisma = getPrismaClient();
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { server: { include: { members: true } } },
  });
  if (!channel) throw new Error("Channel not found");
  if (!channel.server.members.some((m) => m.userId === userId)) {
    throw new Error("Not a member");
  }
  return prisma.channelMessage.findMany({
    where: { channelId },
    include: { user: { select: { id: true, username: true } } },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
}

module.exports = {
  createMessage,
  listMessages,
};
