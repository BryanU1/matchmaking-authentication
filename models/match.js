const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const MatchSchema = new Schema(
  {
    match_id: {type: String},
    mode: {type: String},
    word: {type: String},
    players: {type: Array},
    result: {type: String},
    date: {type: String},
  }
)

module.exports = mongoose.model('Match', MatchSchema);