const express = require('express');
const router = express.Router();
const user_controller = require('../controllers/userController');

router.get('/', 
user_controller.user_login_get);

router.post('/log-in', 
user_controller.user_login_post);

router.get('/log-in/success',
user_controller.user_login_success);

router.get('/log-in/fail', 
user_controller.user_login_fail);

router.get('/log-out',
user_controller.user_logout);

router.get('/sign-up', 
user_controller.user_create_get);

router.post('/sign-up',
user_controller.user_create_post);


module.exports = router;