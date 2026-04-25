/* eslint-disable @typescript-eslint/no-require-imports */
const { getPrismaClient } = require("../../lib/prisma");

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function createServer({ name, ownerId }) {
  const prisma = getPrismaClient();
  return prisma.serverEntity.create({
    data: {
      name,
      ownerId,
      members: {
        create: {
          userId: ownerId,
          role: "owner",
        },
      },
    },
  });
}

async function listServersForUser(userId) {
  const prisma = getPrismaClient();
  return prisma.serverEntity.findMany({
    where: { members: { some: { userId } } },
    include: { members: true, channels: true },
  });
}

async function deleteServer({ serverId, userId }) {
  const prisma = getPrismaClient();
  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId } },
  });
  if (!membership) {
    throw createError("Not a member", 403);
  }
  if (membership.role !== "owner") {
    throw createError("Only owner can delete server", 403);
  }

  const existingServer = await prisma.serverEntity.findUnique({
    where: { id: serverId },
    select: { id: true },
  });
  if (!existingServer) {
    throw createError("Server not found", 404);
  }

  await prisma.serverEntity.delete({
    where: { id: serverId },
  });
}

module.exports = {
  createServer,
  listServersForUser,
  deleteServer,
};
