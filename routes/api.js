const express = require('express');
const router = express.Router();
const user_controller = require('../controllers/userController');

router.get('/profile',
user_controller.current_user);

module.exports = router;