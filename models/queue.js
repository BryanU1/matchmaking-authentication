const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const QueueSchema = new Schema(
  {
    players: [{type: Object}],
    mode: {type: String}
  }
);

module.exports = mongoose.model('Queue', QueueSchema);