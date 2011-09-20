
/**
 * Module dependencies.
 */

var express = require('express');
var app = express.createServer();
var io = require('socket.io').listen(app);
var sessionStore = new express.session.MemoryStore;// for session and cookies
var parseCookie = require('connect').utils.parseCookie;
var sanitize = require('validator').sanitize,
    check = require('validator').check;

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
  res.render('room', {
    room: req.params.room,
    actives: 0
  });

});

// Socket.io Server stuff
var curQ = {};
var spotify = require('./spotApi.js');
var votes = {};          // indexed by room then 'good', 'neutral', 'bad'

var namer = require('./names.js');
var users = {};          // keeps track of user name per room
var clients = [];        // keeps track of info per socket

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

// On connection, we have to start tracking the vote of the user and give them a random name
// Then we tell them the name they were given
io.sockets.on('connection', function(socket){
  console.log("new client connected");

  // cookies!
  var chatName = '';
  console.log("session id is "+socket.handshake.sessionID)
  sessionStore.get(socket.handshake.sessionID, function(err, session){
    if(!err && session && session.name){
      chatName = session.name;
    }
    else{
      chatName = namer.generalName();
    } 
    clients[socket.id] = {vote : 'neutral', name : chatName};
    socket.emit('name', clients[socket.id].name);
    if(session) {
      session.name = chatName;
      sessionStore.set(socket.handshake.sessionID, session);
    }
  });

  // Adds a song to the queue
  socket.on('queueUp', function(song){
    // if song is valid, get info
    spotify.apiLookup(song, function(songInfo){
      socket.get('room', function(err,room) {
        if(err){
          console.log(err);
        }
        else{
          curQ[room].push(songInfo);
          io.sockets.in(room).emit('songForList', songInfo);
          console.log("\n******curQ is: " + curQ[room]);
        }
      });
    });
  });

  // Start playing a song
  socket.on('startPlayback', function(client){
    if(curTimeout != null){
      clearTimeout(curTimeout);
    }
    socket.get('room', function(err,room) {
      playNextSong(room);
    });
  });

  // User changed vote
  socket.on('vote', function(vote) {
    var prev = clients[socket.id].vote;

    if (prev != vote) {  // ignore if they vote for the same thing
      socket.get('room', function(err,room) { // get room from socket
        console.log(votes[room][prev]);
        votes[room][prev] -= 1;
        votes[room][vote] += 1;
        clients[socket.id].vote = vote;
        io.sockets.in(room).emit('votes', votes[room]);
      });
    }
  });

  // when user disconnects, we have to decrement votes and remove username
  socket.on('disconnect', function() {
    votes[clients[socket.id].vote] -= 1;
    socket.get('room', function(err,room) {
      if(room != null && room in users) { 
        var name = clients[socket.id].name;
        removeFromArray(users[room], name);
        votes[room][clients[socket.id].vote]--;
        io.sockets.in(room).emit('votes', votes[room]);
        io.sockets.in(room).emit('users', users[room].length);
        io.sockets.in(room).emit('chat', 'system', name+' left');
        // maybe get rid of room from the users/votes hashes if no one's in them?
      }
    });
  });

  // Change the chat name for a user
  socket.on('chat name', function(name) {
    // Sanitize name
    try{
      check(name).regex('[-a-zA-Z0-9 _]+');
    }
    catch (e){
      name = namer.hackerName();
    }

    socket.get('room', function(err, room) {
      if (room in users) {  // Check for repeat names
        if (users[room].indexOf(name) >= 0) {
          //socket.emit('name error', "Someone else is using that name.");
          socket.emit('chat', 'system', 'Someone else is using that name.');
          name = namer.numberIt(name);
        }
        if (name.length >= 25) {
          //socket.emit('name error', "Your name must be less than 25 characters long.");
          socket.emit('chat', 'system', 'Your name must be less than 25 characters long.');
          name = namer.generalName();
        }

        removeFromArray(users[room], clients[socket.id].name);  // Remove old name
        users[room].push(name);  

        io.sockets.in(room).emit('chat', 'system', clients[socket.id].name+' is now known as '+name);
        clients[socket.id].name = name;
        sessionStore.get(socket.handshake.sessionID, function(err, session){
          // save new name in cookie
          if(!err && session){
            session.name = name;
            sessionStore.set(socket.handshake.sessionID, session);
          }
        });
        socket.emit('name', name);
      }
    });

  });

  // Send message to everyone in the room
  socket.on('chat message', function(msg) {
    var name = clients[socket.id].name;

    socket.get('room', function(err,room) {
      var cleaned = sanitize(msg).xss();  // Sanitize name
      io.sockets.in(room).emit('chat', name, cleaned);
    });
  });

  // join a user to a given room
  socket.on('join room', function(room) {
    if (room in users){  // if the room already exists, increment counts
      users[room].push(clients[socket.id].name);
      votes[room]['neutral']++;
    }
    else {   // otherwise we have to set the counts
      users[room] = [clients[socket.id].name];
      votes[room] = {'good' : 0, 'neutral' : 1, 'bad' : 0};
      curQ[room] = [];
    }
  
    // send current song queue to user
    for(song in curQ[room]){
      socket.emit('songForList', curQ[room][song]);
    }

    console.log('JOINED '+room+' VOTES:'+votes[room]);

    socket.set('room', room);    // set the room var so we can join in later
    sessionStore.get(socket.handshake.sessionID, function(err, session){
      // save new name in cookie
      if(!err && session){
        // remember last visited room
        session.favRoom = room;
        sessionStore.set(socket.handshake.sessionID, session);
      }
    });
    socket.join(room);           // actually join the room

    // update votes/users info for everyone in the room
    io.sockets.in(room).emit('votes', votes[room]);
    io.sockets.in(room).emit('users', users[room].length);
    socket.broadcast.to(room).emit('chat', 'system', clients[socket.id].name + ' connected');
    socket.emit('chat', 'system', 'Now listening in: ' + room);

  });

});

// song starting function
var curTimeout = null;
function playNextSong(room){
  if(curQ[room].length > 0){    
    var songInfoRaw = curQ[room].shift();
    var songInfo = JSON.parse(songInfoRaw);

    io.sockets.in(room).emit('changeSong', songInfo.track.href);

    // Set votes in the room to be all neutral
    votes[room]['good'] = 0;
    votes[room]['neutral'] = users[room].length;
    votes[room]['bad'] = 0;

    // Reset client votes from room to be neutral
    var room_clients = io.sockets.clients(room);
    room_clients.forEach(function(room_client) {
      clients[room_client.id].vote = 'neutral';           
    });

    io.sockets.in(room).emit('votes', votes[room]);

    curTimeout = setTimeout(function(){
      playNextSong(room);
    }, songInfo.track.length*1000);
  }
}

function removeFromArray(array, element) {
  var idx = array.indexOf(element);
  array.splice(idx, 1);
}

var port = process.env.PORT || 3000;
app.listen(port);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);

