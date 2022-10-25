const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const AccountSchema = new Schema(
  {
    username: {type: String, required: true, maxLength: 50},
    password: {type: String, required: true, maxLength: 50}
  }
);

module.exports = mongoose.model('Account', AccountSchema);