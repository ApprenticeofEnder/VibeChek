const express = require('express');
const router = express.Router();

const authRouter = require('./auth.routes');
const vibechekRouter = require('./vibechek.routes');
const clientRouter = require('./client.routes');

router.use("/api/auth", authRouter);
router.use("/api/vibechek", vibechekRouter);
router.use(clientRouter);

module.exports = router;