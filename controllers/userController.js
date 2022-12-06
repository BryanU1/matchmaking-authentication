const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const uniqid = require('uniqid'); 


exports.user_create_get = (req, res) => {
  res.render('sign-up-form');
}

// Handle User create on POST.
exports.user_create_post = [
  // Sanitize and validate Username.
  body('username')
    .trim()
    .isLength({min: 1})
    .withMessage('Username is empty')
    .isAlphanumeric()
    .withMessage('Username must contain alphabets or numbers')
    .isLength({min: 8})
    .withMessage('Username must be 8 characters or more'),
  // Sanittize and validate Password.  
  body('password')
    .trim()
    .isLength({min: 1})
    .withMessage('Password is empty')
    .isAlphanumeric()
    .withMessage('Password must contain alphabets or numbers')
    .isLength({min: 8})
    .withMessage('Password must be 8 characters or more'),
  
  (req, res, next) => {
    // Check if username already exists.
    User.findOne({username: req.body.username}, (err, user) => {
      if (err) {
        console.log(err);
      }
      if (user) {
        req.body.error = [{msg: 'Username already in use'}];
      }
      next()
    })
  },
  
  (req, res, next) => {
    // Extract the validation errors from a request.
    const errors = validationResult(req);

    // There are errors. Send error messages in JSON.
    if (!errors.isEmpty()) {
      res.json({
        errors: errors.array()
      })
      return;
    }
    // Username already exists. Send error message in JSON.
    if (req.body.error) {
      res.json({
        error: req.body.error
      })
      return;
    }

    bcrypt.hash(req.body.password, 10, (err, hashedPassword) => {
      if (err) {
        return next(err);
      }
      // Store hash to mongoDB.
      const id = uniqid();
      const user = new User({
        id,
        username: req.body.username,
        password: hashedPassword,
        displayName: req.body.username,
        rating: 800,
        wins: 0,
        losses: 0,
        draws: 0,
        games: 0
      }).save(err => {
        if (err) {
          console.log(err);
          return;
        }
        res.json({status: 200})
      });
    })
  }
]

exports.user_login_get = function(req, res, next) {
  res.render('index', {user: req.user});
}
// Handle login on POST.
exports.user_login_post = (req, res, next) => {
  // Check for username.
  User.findOne({username: req.body.username}, (err, account) => {
    if (err) {
      return next(err);
    }
    // Username does not match. Send message in JSON.
    if (!account) {
      return res.json({message: 'Incorrect username or password'});
    }
    // Username does match. Check and compare hashed password.
    bcrypt.compare(req.body.password, account.password, (err, result) => {
      if (err) {
        return next(err);
      }
      if (result) {
        // Passwords matched. Send a JWT.
        const user = {
          id: account.id,
          username: account.username,
          displayName: account.displayName,
          rating: account.rating
        }

        jwt.sign({user}, process.env.SECRET_KEY, (err, token) => {
          return res.json({token});
        })
      } else {
        // Password do not match. Send error message.
        return res.status(400).json({message: 'incorrect username or password'});
      }
    })
  })
}

// Handle User update on POST.
exports.user_update_post = [
  (req, res, next) => {
    jwt.verify(
      req.token,
      process.env.SECRET_KEY,
      (err) => {
        if (err) {
          res.status(403);
        } else {
          next();
        }
      }
    )
  },

  // Check if username already exist.
  (req, res, next) => {
    User.findOne({username: req.body.username}, (err, user) => {
      if (err) {
        console.log(err);
      }
      if (user && user.id !== req.params.id) {
        req.body.error = ['Username already in use']
      }
      next();
    })
  },

  // Validate and sanitize fields
  body('username')
    .trim()
    .isLength({min: 1})
    .withMessage('Username is empty')
    .isAlphanumeric()
    .withMessage('Username must contain alphabets or numbers')
    .isLength({min: 8})
    .withMessage('Username must be 8 characters or more'),
  body('displayName')
    .trim()
    .isLength({min: 1})
    .withMessage('Display name is empty')
    .isLength({min: 3, max: 25})
    .withMessage('Display name must be between 3 to 25 characters long')
    .isAlphanumeric()
    .withMessage('Display name must contain alphabets or numbers'),
  
  (req, res, next) => {
    // Extract validation errors from request.
    const errors = validationResult(req);
    
    // There are errors. Send error messages in JSON.
    if (!errors.isEmpty()) {
      res.json({errors: errors.array()});
      return;
    }
    if (req.body.error) {
      res.json({error: req.body.error});
      return;
    }
    // Data from form is valid.
    
    // Update fields with escaped and trimmed data.
    User.findOneAndUpdate(
      {id: req.params.id},
      {$set: {
        username: req.body.username,
        displayName: req.body.displayName
      }},
      (err) => {
        if (err) {
          console.log(err);
        }
        // Success - send status in JSON.
        res.json({status: 200});
      }
    )
  }

]


exports.verifyToken = (req, res, next) => {
  const bearerHeader = req.headers['authorization'];
  if (typeof bearerHeader !== 'undefined') {
    // Authorization field exists. Extract and store token.
    const bearer = bearerHeader.split(' ');
    const bearerToken = bearer[1];
    req.token = bearerToken;
    next();
  }
}

// API Routes

// Send leaderboard data on GET.
exports.leaderboard_get = (req, res) => {
  User.find({}, 'displayName rating')
    .sort({'rating': -1})
    .limit(100)
    .exec((err, users) => {
      if (err) {
        console.log(err);
      }
      res.json(users);
    })
}

// Send User data on GET.
exports.profile_get = (req, res) => {
  jwt.verify(
    req.token, 
    process.env.SECRET_KEY, 
    (err, authData) => {
      if (err) {
        res.status(403);
      } else {
        User.findOne({id: authData.user.id}, (err, user) => {
          if (err) {
            console.log(err);
            return;
          }
          res.json({
            message: 'Successfully verified...',
            user
          });
        })
      }
    }
  )
}
