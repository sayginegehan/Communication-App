/* eslint-disable @typescript-eslint/no-require-imports */
const express = require("express");
const { requireAuth } = require("../../middleware/auth");
const controller = require("./servers.controller");

const router = express.Router();

router.get("/", requireAuth, controller.list);
router.post("/", requireAuth, controller.create);
router.delete("/:serverId", requireAuth, controller.remove);

module.exports = router;
