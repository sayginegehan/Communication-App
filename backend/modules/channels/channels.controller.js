/* eslint-disable @typescript-eslint/no-require-imports */
const { z } = require("zod");
const service = require("./channels.service");

const createSchema = z.object({
  serverId: z.string().min(1),
  name: z.string().min(1).max(80),
  type: z.enum(["text", "voice"]).optional(),
});

async function create(req, res) {
  try {
    const payload = createSchema.parse(req.body);
    const channel = await service.createChannel({
      serverId: payload.serverId,
      name: payload.name,
      type: payload.type || "text",
      userId: req.auth.sub,
    });
    res.status(201).json({ channel });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

async function list(req, res) {
  try {
    const serverId = String(req.query.serverId || "");
    const channels = await service.listChannels(serverId, req.auth.sub);
    res.json({ channels });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

module.exports = {
  create,
  list,
};
