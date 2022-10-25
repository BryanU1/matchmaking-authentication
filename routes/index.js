const express = require('express');
const router = express.Router();
const user_controller = require('../controllers/userController');

router.get('/', function(req, res, next) {
  res.render('index');
})

router.get('/sign-up', (req, res) => res.render('sign-up-form'));

router.post('/sign-up',
user_controller.user_create_post);
module.exports = router;