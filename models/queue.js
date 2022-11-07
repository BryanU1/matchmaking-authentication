const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const QueueSchema = new Schema(
  {
    players: {type: Array}
  }
);

module.exports = mongoose.model('Queue', QueueSchema);