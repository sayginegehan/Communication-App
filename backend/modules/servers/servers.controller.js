/* eslint-disable @typescript-eslint/no-require-imports */
const { z } = require("zod");
const service = require("./servers.service");

const createSchema = z.object({
  name: z.string().min(1).max(80),
});

async function create(req, res) {
  try {
    const payload = createSchema.parse(req.body);
    const server = await service.createServer({ name: payload.name, ownerId: req.auth.sub });
    res.status(201).json({ server });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

async function list(req, res) {
  const servers = await service.listServersForUser(req.auth.sub);
  res.json({ servers });
}

module.exports = {
  create,
  list,
};
