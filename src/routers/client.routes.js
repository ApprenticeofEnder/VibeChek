const express = require('express');
const path = require('path');
const {checkSession} = require('../middleware');
const clientRouter = express.Router();

clientRouter.get("*", (req, res)=>{
    res.sendFile(path.join(__dirname, '/../public/index.html'));
});

module.exports = clientRouter;