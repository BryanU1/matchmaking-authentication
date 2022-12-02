const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
const path = require('path');
const session = require('express-session');
const mongoose = require('mongoose');
require('dotenv').config();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const EventEmitter = require("events").EventEmitter;
const ee = new EventEmitter();
const uniqid = require('uniqid');
const randomWords = require('random-words');
const dateFormat = require('dateformat');
const async = require('async');

const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');

const Match = require('./models/match');
const User = require('./models/user');

const mongoDb = `mongodb+srv://admin001:${process.env.PASSWORD}@cluster0.zpbe5jy.mongodb.net/?retryWrites=true&w=majority`;
mongoose.connect(mongoDb, { useNewUrlParser: true, useUnifiedTopology: true});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(cors());
app.use(session({ secret: "cats", resave: false, saveUninitialized: true }));
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

app.use('/', indexRouter);
app.use('/api', apiRouter);

io.on('connection', function(socket) {
  console.log('user connected: ' + socket.id);
  console.log('normal pairing listener count: ' + ee.listenerCount('trigger pairing: normal'));
  console.log('ranked pairing listener count: ' + ee.listenerCount('trigger pairing: ranked'));
  console.log('----------------');
  
  socket.on('turn off pairing listener', (mode) => {
    if (mode === 'normal') {
      ee.removeListener('trigger pairing: normal', normMatch);
      console.log('normal pairing listener: ' + ee.listenerCount('trigger pairing: normal'));
    }
    if (mode === 'ranked') {
      ee.removeListener('trigger pairing: ranked', rankedMatch);
      console.log('ranked pairing listener: ' + ee.listenerCount('trigger pairing: ranked'));
    }
  })

  socket.on('turn off player disconnected listener', () => {
    ee.removeListener('player disconnected', handleDisconnect);
    console.log('Disconnect listener: ' + ee.listenerCount('player disconnected'));
  })

  socket.on('turn on player disconnected listener', () => {
    ee.on('player disconnected', handleDisconnect);
    console.log('Disconnect listener: ' + ee.listenerCount('player disconnected'));
  })

  socket.on('join queue', (token, mode) => {
    jwt.verify(
      token,
      process.env.SECRET_KEY,
      (err, authData) => {
        if (err) {
          console.log(err);
          return;
        }
        User.findOne({id: authData.user.id}, async (err, user) => {
          if (err) {
            console.log(err);
          }
          socket.data.user = user;
          if (mode === 'normal') {
            socket.join('waiting room: normal');
            ee.on('trigger pairing: normal', normMatch);
            
            const sockets = await io.in('waiting room: normal').fetchSockets();
            console.log('in waiting room (normal):')
            for (const user of sockets) {
              console.log(user.data.user.username);
            }
            if (sockets.length === 2) {
              ee.emit('trigger pairing: normal');
            }
          }
          if (mode === 'ranked') {
            socket.join('waiting room: ranked');
            ee.on('trigger pairing: ranked', rankedMatch);
            console.log('trigger pairing count (ranked): ' + ee.listenerCount('trigger pairing: ranked'))
  
            const sockets = await io.in('waiting room: ranked').fetchSockets();
            console.log('in waiting room (ranked): ')
            for (const user of sockets) {
              console.log(user.data.user.username);
            }
            
            if (sockets.length === 2) {
              ee.emit('trigger pairing: ranked');
            }
          }
        })
      }
    )
  })
    
  socket.on('leave queue', (mode) => {
    if (mode === 'normal') {
      socket.leave('waiting room: normal');
    }
    if (mode === 'ranked') {
      socket.leave('waiting room: ranked');
    }
  })

  socket.on('check player status', async (isReady, id, mode) => {
    const sockets = await io.to(`lobby_${id}`).fetchSockets();
    socket.data.user.isReady = isReady;
    
    if (isReady) {
      socket.emit('player status received');
      // Check other player's ready status
      for (const player of sockets) {
        if (!player.data.user.isReady) {
          return;
        }
      }
      
      // Move everyone to a live match room
      io.in(`lobby_${id}`).socketsJoin(`match_${id}`);
      io.in(`match_${id}`).socketsLeave(`lobby_${id}`);
      
      // Generate random 5 letter word
      let word;
      let rightLength = false;
      while (!rightLength) {
        word = randomWords().toUpperCase();
        if (word.length == 5) {
          rightLength = true;
        }
      }
      
      let players = [];
      players.push(sockets[0].data.user);
      players.push(sockets[1].data.user);

      const now = new Date();

      // Add match document to mongodb
      const match = new Match({
        match_id: id,
        mode,
        word,
        players,
        date: dateFormat(now, 'mm/dd/yy')
      })

      match.save((err) => {
        if (err) {
          console.log(err);
        }
        io.to(`match_${id}`).emit('start match',
          [
            {
              id: players[0].id,
              displayName: players[0].displayName,
              rating: players[0].rating
            },
            {
              id: players[1].id,
              displayName: players[1].displayName,
              rating: players[1].rating
            }
          ]          
        );
      })
    }
    // if player is not ready, emit match cancelled
    if (!isReady) {
      io.to(`lobby_${id}`).emit('cancel match');
      io.to(`lobby_${id}`).emit('player status received');
      io.socketsLeave(`lobby_${id}`);
    }
  })  

  socket.on('check answer', (id, input) => {
    Match.findOne({match_id: id}, async (err, result) => {
      if (err) {
        console.log(err);
      }
      const answer = result.word;
      const arr = [];

      if (input === answer) {
        if (result.mode === 'ranked') {
          // Get the socket list
          let opponent;
          let oppRating;
          let thisRating = socket.data.user.rating;
          const sockets = await io.to(`match_${id}`).fetchSockets();
          for (const player of sockets) {
            if (player.id !== socket.id) {
              opponent = player.data.user;
              oppRating = player.data.user.rating;
              thisRating += Math.round(15 * oppRating / thisRating);
              oppRating -= Math.round(15 * oppRating / thisRating);
              if (oppRating < 100) {
                oppRating = 100;
              }
            }
          }
          async.parallel(
            {
              match(callback) {
                Match.findOneAndUpdate(
                  {
                    match_id: id
                  }, 
                  {
                    $set: {result: socket.data.user.username}
                  }
                ).exec(callback);
              },
              user1(callback) {
                User.findOneAndUpdate(
                  {
                    id: socket.data.user.id 
                  },
                  {
                    $set: {rating: thisRating},
                    $inc: {wins: 1, games: 1}
                  }
                ).exec(callback);
              },
              user2(callback) {
                User.findOneAndUpdate(
                  {
                    id: opponent.id
                  },
                  {
                    $set: {rating: oppRating},
                    $inc: {losses: 1, games: 1}
                  }
                ).exec(callback);
              }
            },
            (err, result) => {
              if (err) {
                console.log(err);
              }
              io.to(`match_${id}`).emit(
                'end match',
                {
                  winner: socket.data.user.username,
                  mode: result.match.mode,
                  word: answer,
                  ratings: [
                    {
                      username: socket.data.user.username,
                      rating: thisRating
                    }, 
                    {
                      username: opponent.username, 
                      rating: oppRating
                    }
                  ]
                }
              )
              io.socketsLeave(`match_${id}`);
            }
          )
        }
        if (result.mode === 'normal') {
          Match.findOneAndUpdate({match_id: id}, {$set: {result: socket.data.user.username}}, (err) => {
            if (err) {
              console.log(err);
            }
            io.to(`match_${id}`).emit(
              'end match', 
              {
                winner: socket.data.user.username,
                word: answer,
              }
            );
            io.socketsLeave(`match_${id}`);
          })
        }
      } else {
        outerloop: for (let i = 0; i < 5; i++) {
          if (input.charAt(i) === answer.charAt(i)) {
            arr.push({
              letter: input.charAt(i),
              color: 'green'
            })
            continue;
          }
          for (let j = 0; j < 5; j++) {
            if (input.charAt(i) === answer.charAt(j)) {
              arr.push({
                letter: input.charAt(i),
                color: 'yellow'
              })
              continue outerloop;
            }
          }
          arr.push({
            letter: input.charAt(i),
            color: 'gray'
          })
        }
        io.to(`match_${id}`).emit('incorrect', {
          arr, 
          user: socket.data.user.username 
        });
      }
    })
  })

  socket.on('stalemate', async (id) => {
    socket.data.user.stalemate = true;
    let opponent;
    const sockets = await io.to(`match_${id}`).fetchSockets();
    for (const player of sockets) {
      if (player.id !== socket.id) {
        opponent = player.data.user;
      }
      if (!player.data.user.stalemate) {
        return;
      }
    }

    async.parallel(
      {
        match(callback) {
          Match.findOneAndUpdate(
            {
              match_id: id
            }, 
            {
              $set: {result: 'draw'}
            }
          ).exec(callback);
        },

        user1(callback) {
          User.findOneAndUpdate(
            {
              id: socket.data.user.id
            },
            {
              $inc: {draws: 1, games: 1}
            }
          ).exec(callback);
        },

        user2(callback) {
          User.findOneAndUpdate(
            {
              id: opponent.id
            },
            {
              $inc: {draws: 1, games: 1}
            }
          ).exec(callback);
        }
      },
      (err, result) => {
        if (err) {
          console.log(err);
        }
        io.to(`match_${id}`).emit('end match', {
          winner: 'none',
          word: result.match.word
        });
        io.socketsLeave(`match_${id}`);
      }
    )
  })

  socket.on('disconnect', function() {
    ee.emit('player disconnected');
    ee.removeListener('player disconnected', handleDisconnect);
    console.log('Disconnect listener count: ' + ee.listenerCount('player disconnected'));
    console.log('A user disconnected');
    console.log('----------------');
    ee.removeListener('trigger pairing: normal', normMatch);
    ee.removeListener('trigger pairing: ranked', rankedMatch);
  })

  async function handleDisconnect() {
    const id = socket.data.roomID;
    const sockets = await io.to(`match_${id}`).fetchSockets();
    if (socket.id !== sockets[0].id){
      Match.findOne({match_id: id}, (err, match) => {
        if (err) {
          console.log(err);
        }
        if (match.mode === 'ranked') {
          const opponent = sockets[0].data.user;
          thisRating = socket.data.user.rating;
          oppRating = opponent.rating;

          thisRating -= 30;
          oppRating += 15;

          async.parallel(
            {
              match(callback) {
                Match.findOneAndUpdate(
                  {
                    match_id: id
                  },
                  {
                    $set: {result: opponent.username}
                  }
                ).exec(callback);
              },
              // User that is still connected
              user1(callback) {
                User.findOneAndUpdate(
                  {
                    id: opponent.id
                  },
                  {
                    $set: {rating: oppRating},
                    $inc: {wins: 1, games: 1}
                  }
                ).exec(callback);
              },
              // User that disconnected
              user2(callback) {
                User.findOneAndUpdate(
                  {
                    id: socket.data.user.id
                  },
                  {
                    $set: {rating: thisRating},
                    $inc: {losses: 1, games: 1}
                  }
                ).exec(callback);
              }
            },
            (err, result) => {
              if (err) {
                console.log(err);
              }
              io.to(`match_${id}`).emit(
                'end match',
                {
                  winner: result.user1.username,
                  mode: match.mode,
                  word: match.word,
                  ratings: [
                    {
                      username: result.user2.username,
                      rating: thisRating
                    }, 
                    {
                      username: result.user1.username, 
                      rating: oppRating
                    }
                  ],
                  message: `${result.user2.displayName} has disconnected`
                }
              )
              io.socketsLeave(`match_${id}`);
            }
          )
        }
        if (match.mode === 'normal') {
          for (const player of sockets) {
            // if other player is in stalemate, end match
            if (player.data.user.stalemate) {
              Match.findOneAndUpdate({match_id: id}, {$set: {result: 'draw'}}, (err, result) => {
                if (err) {
                  console.log(err);
                }
                io.to(`match_${id}`).emit('end match', {
                  winner: 'none',
                  word: result.word
                });
                io.socketsLeave(`match_${id}`);
              })
            }
          }
          io.to(`match_${id}`).emit('player disconnected');
        }
      })
    }
  }

  async function normMatch() {
    const sockets = await io.in('waiting room: normal').fetchSockets();
    if (sockets.length >= 2 && sockets[0].id == socket.id) {
      normPairing(sockets);
  
      ee.emit('trigger pairing: normal');
    }
  }

  async function normPairing(socketsList) {
    const id = uniqid();
    socket.leave('waiting room: normal')
    socketsList[1].leave('waiting room: normal');
  
    socket.join(`lobby_${id}`);
    socketsList[1].join(`lobby_${id}`);
  
    io.to(`lobby_${id}`).emit('match found', id);
  
    // Add id to data property in each socket
    const players = await io.in(`lobby_${id}`).fetchSockets();
    console.log(`users in lobby_${id}:`)
    for (const player of players) {
      console.log(player.data.user.username);
      player.data.roomID = id;
    }
  }

  async function rankedMatch() {
    const sockets = await io.in('waiting room: ranked').fetchSockets();
    if (sockets.length >= 2 && sockets[0].id == socket.id) {
      rankedPairing(sockets);
      ee.emit('trigger pairing: ranked');
    }
  }

  async function rankedPairing(socketsList) {
    const id = uniqid();
    let min;
    for (let i = 1; i < socketsList.length; i++) {
      const current = socketsList[i];
      if (i === 1) {
        min = current;
        continue;
      }
      const curRating = current.data.user.rating;
      const socketRating = socket.data.user.rating;
      const minRating = min.data.user.rating;
      
      const minDiff = Math.abs(minRating, socketRating);
      const currentDiff = Math.abs(curRating, socketRating);

      if (currentDiff < minDiff) {
        min = current;
      } 
    }
    socket.join(`lobby_${id}`);
    min.join(`lobby_${id}`);

    io.in(`lobby_${id}`).socketsLeave('waiting room: ranked');

    io.to(`lobby_${id}`).emit('match found', id);

    // Add id to data property in each socket in this lobby
    const sockets = await io.in(`lobby_${id}`).fetchSockets();
    console.log(`users in ranked lobby_${id}:`)
    for (const user of sockets) {
      console.log(`${user.data.user.username} (${user.data.user.rating})`);
      user.data.roomID = id;
    }
  }
})


server.listen(5000, () => console.log("app listening on port 5000!"));
