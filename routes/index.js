const express = require('express');
const router = express.Router();
const user_controller = require('../controllers/userController');
const queue_controller = require('../controllers/queueController');

// Authentication Routes

router.get('/', 
user_controller.user_login_get);

router.post('/log-in', 
user_controller.user_login_post);

router.get('/sign-up', 
user_controller.user_create_get);

router.post('/sign-up',
user_controller.user_create_post);

// Matchmaking Routes

router.post('/queue',
user_controller.verifyToken,
user_controller.current_user,
queue_controller.join_queue_get);

module.exports = router;