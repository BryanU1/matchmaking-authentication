const express = require('express');
const router = express.Router();
const user_controller = require('../controllers/userController');
const passport = require('passport');

router.get('/', function(req, res, next) {
  res.render('index', {user: req.user});
})

router.post('/log-in', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/'
}));

router.get('/log-out', (req, res, next) => {
  req.logout(function(err) {
    if (err) {
      return next(err);
    }
    res.redirect('/');
  });
});

router.get('/sign-up', (req, res) => res.render('sign-up-form'));

router.post('/sign-up',
user_controller.user_create_post);


module.exports = router;