
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

// Socket.io Server stuff
var MAX_HISTORY = 3;     // max number of previously played songs to keep
var curQ = {};           // current song queue per room. stores 'curIdx' and 'songs'
                         // curQ.songs[curIdx] has status = 'cur', if idx < curIdx then status = 'prev'. o/w status = 'next'
var spotify = require('./spotApi.js');
var votes = {};          // indexed by room then songId then user

var namer = require('./names.js');
var users = {};          // keeps track of user name per room
var clients = [];        // keeps track of info per socket

var songs = {};          // represents mapping from songID to songInfo.
                         // NOTE: songInfo is also in curQ[room]...
var unusedId = 0;        // Jankity jank

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

  // cookies!
  var chatName = '';
  sessionStore.get(socket.handshake.sessionID, function(err, session){
    if(!err && session && session.name){
      chatName = session.name;
    }
    else{
      chatName = namer.generalName();
    } 
    clients[socket.id] = {name : chatName};
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
          var songObject = JSON.parse(songInfo);
          songObject.status = 'next';
          songObject.id = unusedId++;
          curQ[room].songs.push(songObject);
          songs[songObject.id] = songObject;
          votes[room][songObject.id] = {};
          io.sockets.in(room).emit('songForList', songObject);
          console.log("\n******curQ is: " + curQ[room].songs);
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
  socket.on('vote', function(songId, vote) {
      socket.get('room', function(err,room) { // get room from socket
              votes[room][songId][socket.id] = vote;
              setSongAvg(songId,room);
      });
  });

  // when user disconnects, we have to remove username
  socket.on('disconnect', function() {
    socket.get('room', function(err,room) {
      if(room != null && room in users) { 
        var name = clients[socket.id].name;
        removeFromArray(users[room], name);
        io.sockets.in(room).emit('users', users[room].length);
        io.sockets.in(room).emit('chat', 'system', name+' left');
        for(var song in curQ[room].songs){
          var songId = curQ[room].songs[song].id; 
          console.log('\n********songid:'+songId +'********');
          votes[room][songId][socket.id] = 0;
          setSongAvg(songId,room);
        }
        // maybe get rid of room from the users hashes if no one's in them?
      }
    });
  });

  // Change the chat name for a user
  socket.on('chat name', function(name) {
    // Sanitize name
    try{
      check(name).regex(/^[-a-z0-9 _]+$/i);
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
      socket.broadcast.to(room).emit('chat', name, cleaned, false);  // doesn't get sent back to the originating socket
      socket.emit('chat', name, cleaned, true);   // send user cleaned version of their message
    });
  });

  // join a user to a given room
  socket.on('join room', function(room) {
    if (room in users){  // if the room already exists, increment counts
      users[room].push(clients[socket.id].name);
      // start song playback
      if (curQ[room].curIdx >= 0) {
        var curSong = curQ[room].songs[curQ[room].curIdx];
        if (curSong.status == 'cur') {   // current song might be over
            socket.emit('changeSong', curSong.track.href, curSong.startTime);  // start playback
            console.log('*******'+curSong.startTime+'*********');
        }
      }

    }
    else {   // otherwise we have to set the counts
      users[room] = [clients[socket.id].name];
      curQ[room] = {curIdx:-1, songs:[]};
      votes[room] = {}
    }
  
    // send current song queue to user
    for(song in curQ[room].songs){
      socket.emit('songForList', curQ[room].songs[song]);
    }
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
    socket.join(room);           // actually join the room
  
    // update users info for everyone in the room
    io.sockets.in(room).emit('users', users[room].length);
    socket.broadcast.to(room).emit('chat', 'system', clients[socket.id].name + ' connected');
    socket.emit('chat', 'system', 'Now listening in: ' + room);

  });

});

function setSongAvg(songId, room) {
  var avg = 0;
  for(var key in votes[room][songId]) {
        avg += votes[room][songId][key];
  }

  songs[songId].avg = avg / users[room].length;
  console.log('****songid:'+songId+' avg: '+songs[songId].avg+'****');
  io.sockets.in(room).emit('vote update', songId, songs[songId].avg);

}

// song starting function
var curTimeout = null;
function playNextSong(room){
    // if curIdx = 2 then we have 3 songs in the queue already, want to make sure
    // we have 4 songs in the queue, meaning that we have a new song to go to
  if(curQ[room].songs.length > curQ[room].curIdx+1){    
      if (curQ[room].curIdx >= 0) {
        curQ[room].songs[curQ[room].curIdx].status = 'prev';
      }
      if (curQ[room].curIdx == MAX_HISTORY) {  
	  // if we have the max number of songs in history already, clear a song out
          // don't need to increment curIdx since songs get shifted
	  curQ[room].songs.shift();
      }
      else {  // have to increment curIdx this time since no shift happened
	  curQ[room].curIdx++;
      }
      console.log('\n******* curQ[room].curIdx:'+curQ[room].curIdx+' '+MAX_HISTORY+'******\n');
    var songInfo = curQ[room].songs[curQ[room].curIdx];
    songInfo.status = 'cur';
    songInfo.startTime = (new Date()).getTime();
    io.sockets.in(room).emit('changeSong', songInfo.track.href, 0);
    
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

