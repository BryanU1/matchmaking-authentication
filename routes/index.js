const express = require('express');
const router = express.Router();
const user_controller = require('../controllers/userController');


// Authentication Routes

router.get('/', 
user_controller.user_login_get);

router.post('/log-in', 
user_controller.user_login_post);

router.get('/sign-up', 
user_controller.user_create_get);

router.post('/sign-up',
user_controller.user_create_post);

router.post('/user/:id/update',
user_controller.verifyToken,
user_controller.user_update_post);

module.exports = router;