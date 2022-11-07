const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const LobbySchema = new Schema(
  {
    player1: {type: Object},
    player2: {type: Object},
    mode: {type: String},
  }
)

module.exports = mongoose.model('Lobby', LobbySchema);