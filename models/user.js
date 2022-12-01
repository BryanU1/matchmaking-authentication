const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const UserSchema = new Schema(
  {
    id: {type: String, required: true},
    username: {type: String, required: true},
    password: {type: String, required: true},
    displayName: {type: String},
    rating: {type: Number},
    wins: {type: Number},
    losses: {type: Number},
    draws: {type: Number},
    games: {type: Number}
  }
);

module.exports = mongoose.model('User', UserSchema);