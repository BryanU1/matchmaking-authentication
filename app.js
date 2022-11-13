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
        
        // Join waiting room
        socket.join("waiting room");
        
        const sockets = await io.in("waiting room").fetchSockets();
        if (sockets.length == 2) {
          ee.emit('trigger pairing');

          // Print the remaining users in the waiting room
          const waiting = await io.in("waiting room").fetchSockets();
          console.log('users in waiting room:')
          for (const user of waiting) {
            console.log(user.data.user.username);
          }

          io.to('game room').emit('stop queue');
        }
      }
    )
  })

  socket.on('leave queue', async () => {
    socket.leave('waiting room');
  })

  ee.on('trigger pairing', async () => {
    const sockets = await io.in('waiting room').fetchSockets();
    if (sockets.length >= 2 && sockets[0].id == socket.id) {
      pairing(socket, sockets);
      const waiting = await io.in("waiting room").fetchSockets();

      console.log('users in waiting room:');
      for (const user of waiting) {
        console.log(user.data.user.username);
      }

      ee.emit('trigger pairing');

      io.to('game room').emit('stop queue');
    }
  })

  socket.on('disconnect', function() {
    console.log('A user disconnected');
  })

})

async function pairing(socket, socketsList) {
  socket.leave("waiting room")
  socketsList[1].leave("waiting room");

  // move the first and second socket to another room
  // create a lobby using the 
  // move the paired users to the lobby
  // emit event to client to ask for player ready status
  // have an event listener for players' ready status from client
  //    if ready, 
  //        then put in players ready status
  //        check if everyone is ready
  //        move to another match room
  //    else, 
  //        reset everyones ready status to false
  //        put the ready player back in to the waiting room
  // 

  socket.join("game room");
  socketsList[1].join("game room");

  const players = await io.in("game room").fetchSockets();
  
  console.log('users in game room:')
  for (const player of players) {
    console.log(player.data.user.username);
  }
}

server.listen(5000, () => console.log("app listening on port 5000!"));
