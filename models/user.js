const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const UserSchema = new Schema(
  {
    username: {type: String, required: true},
    password: {type: String, required: true},
    displayName: {type: String},
  }
);

module.exports = mongoose.model('User', UserSchema);