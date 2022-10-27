const User = require('../models/user');
const bcrypt = require('bcryptjs');
const passport = require('passport');

exports.user_create_get = (req, res) => {
  res.render('sign-up-form');
}

exports.user_create_post = (req, res, next) => {
  bcrypt.hash(req.body.password, 10, (err, hashedPassword) => {
    if (err) {
      return next(err);
    }
    const user = new User({
      username: req.body.username,
      password: hashedPassword
    }).save(err => {
      if (err) {
        return next(err);
      }
      res.status(200).json({
        status: 200,
        message: 'Successfully Created New User'
      });
    });
  })
}

exports.user_login_get = function(req, res, next) {
  res.render('index', {user: req.user});
}

exports.user_login_post = passport.authenticate('local', {
  successRedirect: '/log-in/success',
  failureRedirect: '/log-in/fail'
});

exports.user_login_success = (req, res) => {
  res.status(200).json({
    status: 200,
    user: req.user,
    message: 'Successfully logged in'
  })
} 

exports.user_login_fail = (req, res) => {
  res.status(400).json({
    status: 400,
    message: 'Incorrect username or password '
  })
}

exports.user_logout = (req, res, next) => {
  req.logout(function(err) {
    if (err) {
      return next(err);
    }
    res.status(200).json({
      status: 200,
      message: 'Successfully logged out'
    });
  });
}