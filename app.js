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

const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');

const Match = require('./models/match');

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

  socket.on('join queue', (token) => {
    jwt.verify(
      token,
      process.env.SECRET_KEY,
      async (err, authData) => {
        if (err) {
          console.log(err);
          return;
        }
        socket.data.user = authData.user;
        socket.join('waiting room');
        ee.on('trigger pairing', callback);
        
        const sockets = await io.in('waiting room').fetchSockets();
        console.log('In waiting room:')
        for (const user of sockets) {
          console.log(user.data.user.username);
        }
        if (sockets.length == 2) {
          ee.emit('trigger pairing');
        }
      }
    )
  })

  socket.on('leave queue', async () => {
    socket.leave('waiting room');
  })

  socket.on('turn off listener', () => {
    ee.removeListener('trigger pairing', callback);
  })

  socket.on('check player status', async (isReady, id) => {
    const sockets = await io.to(`lobby_${id}`).fetchSockets();
    socket.data.user.isReady = isReady;
    
    if (isReady) {
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
        word,
        players,
        date: dateFormat(now, 'mm/dd/yy')
      })

      match.save((err) => {
        if (err) {
          console.log(err);
        }
        io.to(`match_${id}`).emit('start match');
      })
    }
    // if player is not ready, emit match cancelled
    if (!isReady) {
      io.to(`lobby_${id}`).emit('cancel match');
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
      const sockets = await io.to(`match_${id}`).fetchSockets();

      if (input === answer) {
        Match.findOneAndUpdate({match_id: id}, {$set: {result: socket.data.user.username}}, async (err) => {
          if (err) {
            console.log(err);
          }
          io.to(`match_${id}`).emit(
            'end match', 
            {
              winner: socket.data.user.username,
              word: answer
            }
          );
        })
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
        socket.emit('incorrect', arr);
      }
    })
  })

  socket.on('stalemate', async (id) => {
    console.log(`${socket.data.user.username} in stalemate`);
    socket.data.user.stalemate = true;
    const sockets = await io.to(`match_${id}`).fetchSockets();
    for (const player of sockets) {
      if (!player.data.user.stalemate) {
        return;
      }
    }
    // Both players in stalemate
    Match.findOneAndUpdate({match_id: id}, {$set: {result: 'draw'}}, (err, result) => {
      if (err) {
        console.log(err);
      }
      io.to(`match_${id}`).emit('end match', {
        winner: 'none',
        word: result.word
      });
    })

  })

  socket.on('disconnect', function() {
    console.log('A user disconnected');
  })

  async function callback() {
    const sockets = await io.in('waiting room').fetchSockets();
    if (sockets.length >= 2 && sockets[0].id == socket.id) {
      pairing(socket, sockets);
  
      ee.emit('trigger pairing');
    }
  }

  async function pairing(socket, socketsList) {
    const id = uniqid();
    socket.leave('waiting room')
    socketsList[1].leave('waiting room');
  
    socket.join(`lobby_${id}`);
    socketsList[1].join(`lobby_${id}`);
  
    io.to(`lobby_${id}`).emit('match found', id);
  
    // Print players in newly formed lobby
    const players = await io.in(`lobby_${id}`).fetchSockets();
    console.log(`users in lobby_${id}:`)
    for (const player of players) {
      console.log(player.data.user.username);
    }
  }
})


server.listen(5000, () => console.log("app listening on port 5000!"));
