const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const mongoose = require('mongoose');
require('dotenv').config();
const indexRouter = require('./routes/index');
const User = require('./models/user.js');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const mongoDb = `mongodb+srv://admin001:${process.env.PASSWORD}@cluster0.zpbe5jy.mongodb.net/?retryWrites=true&w=majority`;
mongoose.connect(mongoDb, { useNewUrlParser: true, useUnifiedTopology: true});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

const app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

passport.use(
  new LocalStrategy((username, password, done) => {
    User.findOne({ username: username }, (err, user) => {
      if (err) { 
        return done(err);
      }
      if (!user) {
        return done(null, false, { message: "Incorrect username" });
      }
      bcrypt.compare(password, user.password, (err, res) => {
        if (res) {
          // passwords match! log user in
          return done(null, user);
        } else {
          // passwords do not match!
          return done(null, false, { message: "Incorrect password" })
        }
      })
    });
  })
);
passport.serializeUser(function(user, done) {
  done(null, user.id);
});
passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

app.use(cors());
app.use(session({ secret: "cats", resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.urlencoded({ extended: false }));

app.use('/', indexRouter);

app.listen(5000, () => console.log("app listening on port 5000!"));
