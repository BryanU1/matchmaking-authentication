const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator'); 

exports.user_create_get = (req, res) => {
  res.render('sign-up-form');
}

exports.user_create_post = [
  body('username')
    .trim()
    .isLength({min: 1})
    .withMessage('Username is empty')
    .isAlphanumeric()
    .withMessage('Username must contain alphabets or numbers')
    .isLength({min: 8})
    .withMessage('Username must be 8 characters or more')
    .custom(value => {
      User.findOne({username: value}, user => {
        if (user) {
          return Promise.reject()
        }
      })
    })
    .withMessage('Username already in use'),
  body('password')
    .trim()
    .isLength({min: 1})
    .withMessage('Password is empty')
    .isAlphanumeric()
    .withMessage('Password must contain alphabets or numbers')
    .isLength({min: 8})
    .withMessage('Password must be 8 characters or more'),
  
  (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      res.json({
        errors: errors.array()
      })
      return;
    }

    bcrypt.hash(req.body.password, 10, (err, hashedPassword) => {
      if (err) {
        return next(err);
      }
      const user = new User({
        username: req.body.username,
        password: hashedPassword,
        displayName: req.body.username,
        rating: 800
      }).save(err => {
        if (err) {
          console.log(err);
          return;
        }
        res.json({errors: []})
      });
    })
  }
]

exports.user_login_get = function(req, res, next) {
  res.render('index', {user: req.user});
}

exports.user_login_post = (req, res, next) => {
  User.findOne({username: req.body.username}, (err, account) => {
    if (err) {
      return next(err);
    }
    if (!account) {
      return res.json({message: 'incorrect username or password'});
    }
    bcrypt.compare(req.body.password, account.password, (err, result) => {
      if (err) {
        return next(err);
      }
      if (result) {
        // if passwords match, log user in
        const user = {
          id: account._id,
          username: account.username,
          displayName: account.displayName,
          rating: account.rating
        }

        jwt.sign({user}, process.env.SECRET_KEY, (err, token) => {
          return res.json({token});
        })
      } else {
        // passwords do not match!
        return res.status(400).json({message: 'incorrect username or password'});
      }
    })
  })
}

exports.current_user = (req, res, next) => {
  jwt.verify(
    req.token, 
    process.env.SECRET_KEY, 
    (err, authData) => {
      if (err) {
        res.status(403);
      } else {
        req.authData = authData;
        next();
      }
    }
  )
}

exports.verifyToken = (req, res, next) => {
  const bearerHeader = req.headers['authorization'];
  if (typeof bearerHeader !== 'undefined') {
    const bearer = bearerHeader.split(' ');
    const bearerToken = bearer[1];
    req.token = bearerToken;
    next();
  }
}

// API Routes

exports.profile_get = (req, res) => {
  jwt.verify(
    req.token, 
    process.env.SECRET_KEY, 
    (err, authData) => {
      if (err) {
        res.status(403);
      } else {
        res.json({
          message: 'Successfully verified...',
          authData
        });
      }
    }
  )
}
