const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const MatchSchema = new Schema(
  {
    match_id: {type: String},
    player1: {type: Object},
    player2: {type: Object},
    mode: {type: String},
    moves: {type: Object},
    date: {type: String},
  }
)

module.exports = mongoose.model('Match', MatchSchema);