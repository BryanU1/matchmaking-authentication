const User = require('../models/user');
const bcrypt = require('bcryptjs');

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
      res.redirect('/');
    });
  })
}