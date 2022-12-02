const express = require('express');
const router = express.Router();
const user_controller = require('../controllers/userController');

router.get('/profile',
user_controller.verifyToken,
user_controller.profile_get);

router.get('/leaderboard',
user_controller.leaderboard_get);

module.exports = router;