/* eslint-disable @typescript-eslint/no-require-imports */
const bcrypt = require("bcryptjs");
const { getPrismaClient } = require("../../lib/prisma");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function register({ email, userName, password }) {
  const prisma = getPrismaClient();
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: {
        email: normalizeEmail(email),
        userName: String(userName || "").trim(),
        passwordHash,
      },
      select: { id: true, email: true, userName: true },
    });
    return user;
  } catch (error) {
    if (error && error.code === "P2002") {
      const conflict = new Error("Email already in use");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}

async function login({ email, password }) {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
  });
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return { id: user.id, email: user.email, userName: user.userName };
}

async function getMe(userId) {
  const prisma = getPrismaClient();
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, userName: true },
  });
}

module.exports = {
  register,
  login,
  getMe,
};
