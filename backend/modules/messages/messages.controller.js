/* eslint-disable @typescript-eslint/no-require-imports */
const { z } = require("zod");
const service = require("./messages.service");

const createSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().min(1).max(4000),
});

async function create(req, res) {
  try {
    const payload = createSchema.parse(req.body);
    const message = await service.createMessage({
      channelId: payload.channelId,
      content: payload.content,
      userId: req.auth.sub,
    });
    res.status(201).json({ message });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

async function list(req, res) {
  try {
    const channelId = String(req.query.channelId || "");
    const messages = await service.listMessages(channelId, req.auth.sub);
    res.json({ messages });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

module.exports = {
  create,
  list,
};
