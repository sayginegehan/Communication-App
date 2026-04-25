/* eslint-disable @typescript-eslint/no-require-imports */
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { getPrismaClient } = require("../../lib/prisma");

const LEGACY_HASH_ALGORITHM = "sha512";
const LEGACY_HASH_ITERATIONS = 210000;
const LEGACY_HASH_KEY_LENGTH = 64;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function verifyLegacyPassword(password, storedHash) {
  const [salt, storedKey] = String(storedHash || "").split(".");
  if (!salt || !storedKey) {
    return false;
  }
  const derivedKey = crypto
    .pbkdf2Sync(
      password,
      salt,
      LEGACY_HASH_ITERATIONS,
      LEGACY_HASH_KEY_LENGTH,
      LEGACY_HASH_ALGORITHM
    )
    .toString("hex");
  return crypto.timingSafeEqual(Buffer.from(derivedKey), Buffer.from(storedKey));
}

async function register({ email, userName, password }) {
  const prisma = getPrismaClient();
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: {
        email: normalizeEmail(email),
        userName: String(userName || "").trim(),
        avatarUrl: null,
        bio: "",
        status: "online",
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        userName: true,
        avatarUrl: true,
        bio: true,
        status: true,
      },
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
  let valid = false;
  if (String(user.passwordHash || "").startsWith("$2")) {
    valid = await bcrypt.compare(password, user.passwordHash);
  } else {
    valid = verifyLegacyPassword(password, user.passwordHash);
    if (valid) {
      // One-time migration: upgrade legacy hash format on successful login.
      const newHash = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });
    }
  }
  if (!valid) return null;
  return {
    id: user.id,
    email: user.email,
    userName: user.userName,
    avatarUrl: user.avatarUrl,
    bio: user.bio || "",
    status: user.status || "online",
  };
}

async function getMe(userId) {
  const prisma = getPrismaClient();
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      userName: true,
      avatarUrl: true,
      bio: true,
      status: true,
    },
  });
}

async function updateProfile(userId, { userName, avatarUrl, bio, status }) {
  const prisma = getPrismaClient();
  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(typeof userName === "string" ? { userName: userName.trim() } : {}),
      ...(typeof avatarUrl === "string" ? { avatarUrl: avatarUrl.trim() || null } : {}),
      ...(typeof bio === "string" ? { bio } : {}),
      ...(typeof status === "string" ? { status } : {}),
    },
    select: {
      id: true,
      email: true,
      userName: true,
      avatarUrl: true,
      bio: true,
      status: true,
    },
  });
}

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
};
