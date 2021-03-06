/**
 * Module dependencies.
 */

var express = require('express');
var app = express.createServer();
var io = require('socket.io').listen(app);
var sessionStore = new express.session.MemoryStore;// for session and cookies
var parseCookie = require('connect').utils.parseCookie;
var namer = require('./names.js');
var chat = require('./chat.js');
var queue = require('./queue.js');
var check = require('validator').check;

// Configuration
app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.cookieParser());
  app.use(express.session({ secret: "what does this do?", store: sessionStore, key: 'express.sid' }));
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

// Initializing variables?
// find a better place to put these
chat.initChat(io, sessionStore);
queue.initQueue(io);


// Routes
app.get('/', function(req, res){
  if(!req.session.name){
    req.session.name = namer.generalName();
  }
  if(!req.session.favRoom){
    req.session.favRoom = 'room';
  }
  res.render('index', {
    title: 'sup son',
    name: req.session.name,
    favRoom: req.session.favRoom
  });
});

app.get('/:room', function(req, res){
  var roomName = req.params.room;
  try{
    check(roomName).regex(/^[-a-z0-9_]+$/i);
  }
  catch(err){
    roomName = "hackers";
  }
  res.render('room', {
    room: roomName,
    actives: 0
  });

});


// get cookies on socket.io handshake (before connect)
var Session = require('connect').middleware.session.Session;
io.set('authorization', function(data, accept){
  if(data.headers.cookie){
    data.cookie = parseCookie(data.headers.cookie);
    data.sessionID = data.cookie['express.sid'];
    // save the session store to the data object
    data.sessionStore = sessionStore;
    sessionStore.get(data.sessionID, function(err, session){
      if(err){
        console.log("cookie error: " + err.message);
      }
      else{
        data.session = new Session(data, session);
      }
    });
  }
  accept(null, true);// we want the app to work even without cookies
});

// On connection, we have to give them a random name
// Then we tell them the name they were given
io.sockets.on('connection', function(socket){
  console.log("new client connected");

  chat.beginChat(socket);
  queue.prepareQueue(socket);

  // when user disconnects, we have to remove username
  socket.on('disconnect', function() {
    socket.get('room', function(err, room) {
      if(room != null){
        chat.disconnect(socket, room);
        queue.disconnect(socket, room);
      }
    });
  });

  // join a user to a given room
  socket.on('join room', function(room) {
    socket.join(room);           // put socket in socketroom
    chat.addUser(socket, room);
    queue.addUser(socket, room);
    
    console.log('JOINED '+room);
    socket.set('room', room);    // set the room var so we can join in later
    sessionStore.get(socket.handshake.sessionID, function(err, session){
      // save new name in cookie
      if(!err && session){
        // remember last visited room
        session.favRoom = room;
        sessionStore.set(socket.handshake.sessionID, session);
      }
    });

  });

});

var port = process.env.PORT || 3000;
app.listen(port);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
