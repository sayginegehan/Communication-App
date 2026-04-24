/* eslint-disable @typescript-eslint/no-require-imports */
const { z } = require("zod");

const joinRoomSchema = z.object({
  roomId: z.string().trim().min(1).max(64),
  userName: z.string().trim().min(1).max(32),
  serverId: z.string().trim().min(1).max(64).optional(),
});

const messageSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

const statusSchema = z.boolean();

const targetSchema = z.string().trim().min(1);

const signalSchema = z.object({
  to: z.string().trim().min(1),
});

const createServerSchema = z.object({
  serverName: z.string().trim().min(1).max(64),
  userName: z.string().trim().min(1).max(32),
});

const createRoomSchema = z.object({
  serverId: z.string().trim().min(1).max(64),
  roomName: z.string().trim().min(1).max(64),
  userName: z.string().trim().min(1).max(32),
});

const roleChangeSchema = z.object({
  serverId: z.string().trim().min(1).max(64),
  actorUserName: z.string().trim().min(1).max(32),
  targetUserName: z.string().trim().min(1).max(32),
});

const updateServerSettingsSchema = z.object({
  serverId: z.string().trim().min(1).max(64),
  actorUserName: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(500).optional(),
});

const updateRoomSettingsSchema = z.object({
  serverId: z.string().trim().min(1).max(64),
  roomName: z.string().trim().min(1).max(64),
  actorUserName: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(64).optional(),
  topic: z.string().trim().max(500).optional(),
});

function parseOrThrow(schema, payload, eventName) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(", ");
    const error = new Error(`Invalid payload for ${eventName}: ${message}`);
    error.code = "INVALID_PAYLOAD";
    throw error;
  }

  return parsed.data;
}

module.exports = {
  joinRoomSchema,
  messageSchema,
  statusSchema,
  targetSchema,
  signalSchema,
  createServerSchema,
  createRoomSchema,
  roleChangeSchema,
  updateServerSettingsSchema,
  updateRoomSettingsSchema,
  parseOrThrow,
};
