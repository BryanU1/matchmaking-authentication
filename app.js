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
const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

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

  socket.on('join queue', (response) => {
    jwt.verify(
      response.token,
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
    
        if (sockets.length >= 2) {
          pairing(socket, sockets);
    
          const waiting = await io.in("waiting room").fetchSockets();
    
          console.log('users in waiting room:')
          for (const user of waiting) {
            console.log(user.data.user.id);
          }
        }
      }
    )

    //  emit 'game create' to game room
  })

  socket.on('game created', (data) => {
    // emit 'match found'
    console.log(data);
  })

  socket.on('disconnect', function() {
    console.log('A user disconnected');
  })

})

async function pairing(socket, socketsList) {
  socket.leave("waiting room")
  socketsList[0].leave("waiting room");

  socket.join("game room");
  socketsList[0].join("game room");

  const players = await io.in("game room").fetchSockets();
  
  console.log('users in game room:')
  for (const player of players) {
    console.log(player.data.user.id);
  }
}

server.listen(5000, () => console.log("app listening on port 5000!"));
