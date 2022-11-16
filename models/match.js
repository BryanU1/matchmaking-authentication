const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const MatchSchema = new Schema(
  {
    match_id: {type: String},
    word: {type: String},
    players: {type: Array},
    date: {type: String},
  }
)

module.exports = mongoose.model('Match', MatchSchema);