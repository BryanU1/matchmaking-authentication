const express = require('express');
const router = express.Router();
const user_controller = require('../controllers/userController');

router.get('/', 
user_controller.user_login_get);

router.get('/user',
user_controller.current_user);

router.post('/log-in', 
user_controller.user_log_in_post);

router.get('/log-out',
user_controller.user_logout);

router.get('/sign-up', 
user_controller.user_create_get);

router.post('/sign-up',
user_controller.user_create_post);


module.exports = router;