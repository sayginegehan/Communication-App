/* eslint-disable @typescript-eslint/no-require-imports */
const bcrypt = require("bcryptjs");
const { getPrismaClient } = require("../../lib/prisma");

async function register({ email, username, password }) {
  const prisma = getPrismaClient();
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, username, passwordHash },
    select: { id: true, email: true, username: true },
  });
  return user;
}

async function login({ email, password }) {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return { id: user.id, email: user.email, username: user.username };
}

async function getMe(userId) {
  const prisma = getPrismaClient();
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true },
  });
}

module.exports = {
  register,
  login,
  getMe,
};
