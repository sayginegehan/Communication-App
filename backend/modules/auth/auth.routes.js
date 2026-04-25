/* eslint-disable @typescript-eslint/no-require-imports */
const express = require("express");
const { requireAuth } = require("../../middleware/auth");
const controller = require("./auth.controller");

const router = express.Router();

router.post("/register", controller.register);
router.post("/login", controller.login);
router.post("/logout", controller.logout);
router.get("/me", requireAuth, controller.me);
router.post("/refresh", requireAuth, controller.refresh);
router.patch("/profile", requireAuth, controller.updateProfile);

module.exports = router;
