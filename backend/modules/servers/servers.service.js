/* eslint-disable @typescript-eslint/no-require-imports */
const { getPrismaClient } = require("../../lib/prisma");

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

module.exports = {
  createServer,
  listServersForUser,
};
