const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: "https://competitive-wordle.herokuapp.com",
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

// Routes
const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');

// Models
const Match = require('./models/match');
const User = require('./models/user');

// Set up mongoDB.
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

  // Handle join queue event.
  socket.on('join queue', (token, mode) => {
    // Protect event from unauthorized users
    jwt.verify(
      token,
      process.env.SECRET_KEY,
      (err, authData) => {
        if (err) {
          console.log(err);
          return;
        }
        // Store User data in a socket.
        User.findOne({id: authData.user.id}, async (err, user) => {
          if (err) {
            console.log(err);
          }
          socket.data.user = user;

          // Handle normal queue.
          if (mode === 'normal') {
            socket.join('waiting room: normal');
            ee.on('trigger pairing: normal', normMatch);
            
            const sockets = await io.in('waiting room: normal').fetchSockets();
            console.log('in waiting room (normal):')
            for (const user of sockets) {
              console.log(user.data.user.username);
            }
            // Waiting room has enough sockets to start pairing.
            if (sockets.length >= 2) {
              ee.emit('trigger pairing: normal');
            }
          }

          // Handle ranked queue.
          if (mode === 'ranked') {
            socket.join('waiting room: ranked');
            ee.on('trigger pairing: ranked', rankedMatch);
            console.log('trigger pairing count (ranked): ' + ee.listenerCount('trigger pairing: ranked'))
  
            const sockets = await io.in('waiting room: ranked').fetchSockets();
            console.log('in waiting room (ranked): ')
            for (const user of sockets) {
              console.log(user.data.user.username);
            }
            // Waiting room has enough sockets to start pairing.
            if (sockets.length === 2) {
              ee.emit('trigger pairing: ranked');
            }
          }
        })
      }
    )
  })
  
  // Move socket out of waiting room.
  socket.on('leave queue', (mode) => {
    if (mode === 'normal') {
      socket.leave('waiting room: normal');
    }
    if (mode === 'ranked') {
      socket.leave('waiting room: ranked');
    }
  })

  // Check if players are ready before starting game.
  socket.on('check player status', async (isReady, id, mode) => {
    const sockets = await io.to(`lobby_${id}`).fetchSockets();
    socket.data.user.isReady = isReady;
    

    // Player is ready.
    if (isReady) {
      // Emit event to turn off queue timer from client.
      socket.emit('player status received');
      // Check other player's ready status.
      for (const player of sockets) {
        if (!player.data.user.isReady) {
          return;
        }
      }
      // Both players are ready.
      
      // Move everyone to a match room.
      io.in(`lobby_${id}`).socketsJoin(`match_${id}`);
      io.in(`match_${id}`).socketsLeave(`lobby_${id}`);
      
      // Generate a random 5 letter word.
      let word;
      let rightLength = false;
      while (!rightLength) {
        word = randomWords().toUpperCase();
        if (word.length == 5) {
          rightLength = true;
        }
      }
      
      // Create array with user information.
      let players = [];
      players.push(sockets[0].data.user);
      players.push(sockets[1].data.user);

      // Store today's date.
      const today = new Date();

      // Create object and add match document to mongoDB.
      const match = new Match({
        match_id: id,
        mode,
        word,
        players,
        date: dateFormat(today, 'mm/dd/yy')
      })
      match.save((err) => {
        if (err) {
          console.log(err);
        }
        // Success - send socket information of both players.
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
    // Player is not ready. Notify client and cancel match.
    if (!isReady) {
      io.to(`lobby_${id}`).emit('cancel match');
      io.to(`lobby_${id}`).emit('player status received');
      io.socketsLeave(`lobby_${id}`);
    }
  })  

  // Handle answer submission.
  socket.on('check answer', (id, input) => {
    // Retrieve match information.
    Match.findOne({match_id: id}, async (err, result) => {
      if (err) {
        console.log(err);
      }
      const answer = result.word;
      const arr = [];

      // Answer is correct.
      if (input === answer) {
        // Mode is ranked. Calculate and update ratings for both players. 
        if (result.mode === 'ranked') {
          let opponent;
          let oppRating;
          let thisRating = socket.data.user.rating;
          const sockets = await io.to(`match_${id}`).fetchSockets();
          for (const player of sockets) {
            if (player.id !== socket.id) {
              opponent = player.data.user;
              oppRating = player.data.user.rating;

              // Gain less rating if opponent has less rating and vice versa.
              thisRating += Math.round(15 * oppRating / thisRating);
              oppRating -= Math.round(15 * oppRating / thisRating);

              // Set 100 as the minimum rating.
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
              // Success - emit event and send information post match.
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
        // Mode is normal. Update fields in a match document.
        if (result.mode === 'normal') {
          Match.findOneAndUpdate({match_id: id}, {$set: {result: socket.data.user.username}}, (err) => {
            if (err) {
              console.log(err);
            }

            // Success - emit event and send post match information.
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
        // Answer is incorrect. Give hints by assigning each letter a color.
        outerloop: for (let i = 0; i < 5; i++) {
          // Same letter at same index.
          if (input.charAt(i) === answer.charAt(i)) {
            arr.push({
              letter: input.charAt(i),
              color: 'green'
            })
            continue;
          }
          for (let j = 0; j < 5; j++) {
            // Same letter but different index.
            if (input.charAt(i) === answer.charAt(j)) {
              arr.push({
                letter: input.charAt(i),
                color: 'yellow'
              })
              continue outerloop;
            }
          }
          // Letter does not exist.
          arr.push({
            letter: input.charAt(i),
            color: 'gray'
          })
        }
        // Emit event and send array with hints.
        io.to(`match_${id}`).emit('incorrect', {
          arr, 
          user: socket.data.user.username 
        });
      }
    })
  })

  // Handle events when players have 0 more attempts or are out of time.
  socket.on('stalemate', async (id, mode) => {
    socket.data.user.stalemate = true;

    // Store opponent's User information.
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
    // Both players are in stalemate.

    // Mode is in ranked. Update both players' profile.
    if (mode === 'ranked') {
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

          // Success - emit event to end match and send post match information.
          io.to(`match_${id}`).emit('end match', {
            winner: 'none',
            word: result.match.word
          });

          io.socketsLeave(`match_${id}`);
        }
      )
    }

    // Mode is normal. Send post match information to both players.
    if (mode === 'normal') {
      Match.findOne({match_id: id}, (err, match) => {
        if (err) {
          console.log(err);
        }
        io.to(`match_${id}`).emit('end match', {
          winner: 'none',
          word: match.word
        });
        io.socketsLeave(`match_${id}`);
      })
    }
  })

  // Handle socket disconnect. Clean up event listeners.
  socket.on('disconnect', function() {
    ee.emit('player disconnected');
    ee.removeListener('player disconnected', handleDisconnect);
    console.log('Disconnect listener count: ' + ee.listenerCount('player disconnected'));
    console.log('A user disconnected');
    console.log('----------------');
    ee.removeListener('trigger pairing: normal', normMatch);
    ee.removeListener('trigger pairing: ranked', rankedMatch);
  })

  // Handle player disconnecting in ranked match.
  async function handleDisconnect() {
    const id = socket.data.roomID;
    const sockets = await io.to(`match_${id}`).fetchSockets();
    console.log(sockets.length);
    // Prevent handleDisconnect from running twice.
    if (sockets.length > 0 && socket.id !== sockets[0].id) {
      Match.findOne({match_id: id}, (err, match) => {
        if (err) {
          console.log(err);
        }

        // Mode is ranked. Calculate and update rating for both players.
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

              // Success - send post match information.
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
        // Mode is normal.
        if (match.mode === 'normal') {
          for (const player of sockets) {
            if (player.data.user.stalemate) {
              // Opponent is in stalemate. End match.
              Match.findOneAndUpdate({match_id: id}, {$set: {result: 'draw'}}, (err, result) => {
                if (err) {
                  console.log(err);
                }

                // Success - Emit event and send post match information.
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

  // Handle matching in normal queue.
  async function normMatch() {
    const sockets = await io.in('waiting room: normal').fetchSockets();
    if (sockets.length >= 2 && sockets[0].id == socket.id) {
      normPairing(sockets);
  
      ee.emit('trigger pairing: normal');
    }
  }

  // Handle pairing in normal queue
  async function normPairing(socketsList) {
    // Generate random id.
    const id = uniqid();

    // Move first and second sockets to a lobby.
    socket.leave('waiting room: normal')
    socketsList[1].leave('waiting room: normal');
    socket.join(`lobby_${id}`);
    socketsList[1].join(`lobby_${id}`);
  
    // Notify client that match is found.
    io.to(`lobby_${id}`).emit('match found', id);
  
    // Add id to data property in each socket.
    const players = await io.in(`lobby_${id}`).fetchSockets();
    console.log(`users in lobby_${id}:`)
    for (const player of players) {
      console.log(player.data.user.username);
      player.data.roomID = id;
    }
  }

  // Handle matching in ranked queue. 
  async function rankedMatch() {
    const sockets = await io.in('waiting room: ranked').fetchSockets();
    if (sockets.length >= 2 && sockets[0].id == socket.id) {
      // First socket initiates the pairing.
      rankedPairing(sockets);
      ee.emit('trigger pairing: ranked');
    }
  }

  // Handle pairing in ranked queue.
  async function rankedPairing(socketsList) {
    // Generate random id.
    const id = uniqid();

    // Store socket with nearest rating in min.
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
      
      // Calculate rating differences.
      const minDiff = Math.abs(minRating, socketRating);
      const currentDiff = Math.abs(curRating, socketRating);

      if (currentDiff < minDiff) {
        min = current;
      }
    }

    // Move current socket and socket with minimum rating difference.
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


server.listen(process.env.PORT || 3000, () => {
  console.log("app listening on port 3000!");
});
