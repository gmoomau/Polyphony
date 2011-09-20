
/**
 * Module dependencies.
 */

var express = require('express');
var app = express.createServer();
var io = require('socket.io').listen(app);
var sanitize = require('validator').sanitize,
    check = require('validator').check;

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
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
  res.render('index', {
    title: 'sup son'
  });
});

app.get('/:room', function(req, res){
  res.render('room', {
    room: req.params.room,
    actives: 0
  });

});

// Socket.io Server stuff
var MAX_HISTORY = 3;     // max number of previously played songs to keep
var curQ = {};           // current song queue per room. stores 'curIdx' and 'songs'
                         // curQ.songs[curIdx] has status = 'cur', if idx < curIdx then status = 'prev'. o/w status = 'next'
var spotify = require('./spotApi.js');
var votes = {};          // indexed by room then 'good', 'neutral', 'bad'

var users = {};          // keeps track of user name per room
var clients = [];        // keeps track of info per socket


// On connection, we have to start tracking the vote of the user and give them a random name
// Then we tell them the name they were given
io.sockets.on('connection', function(socket){
  console.log("new client connected");

  clients[socket.id] = {vote : 'neutral', name : generateName("anon")};
  socket.emit('name', clients[socket.id].name);

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
          curQ[room].songs.push(songObject);
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
      name = generateName("hax0r");
    }

    socket.get('room', function(err, room) {
      if (room in users) {  // Check for repeat names
        if (users[room].indexOf(name) >= 0) {
          socket.emit('name error', "Sorry, that name is already in use.");
        }
        else if (name.length >= 25) {
          socket.emit('name error', "Your name must be less than 25 characters long.");
        }
        else {   // Name not taken
          removeFromArray(users[room], clients[socket.id].name);  // Remove old name
          users[room].push(name);  

          io.sockets.in(room).emit('chat', 'system', clients[socket.id].name+' set name to '+name);
          clients[socket.id].name = name;
          socket.emit('name', name);
        }
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
      curQ[room] = {curIdx:-1, songs:[]};
    }
  
    // send current song queue to user
    for(song in curQ[room].songs){
      socket.emit('songForList', curQ[room].songs[song]);
    }

  console.log('JOINED '+room+' VOTES:'+votes[room]);

  socket.set('room', room);    // set the room var so we can join in later
  socket.join(room);           // actually join the room

  // update votes/users info for everyone in the room
  io.sockets.in(room).emit('votes', votes[room]);
  io.sockets.in(room).emit('users', users[room].length);
  io.sockets.in(room).emit('chat', 'system', clients[socket.id].name + ' connected');

  });

});

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
    songInfo.status = 'cur'

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

function generateName(base) {
  var chars = '0123456789';
  var name = base;
  for(var i = 0;i<5;i++) {
    var rnum = Math.floor(Math.random()*chars.length);
    name += chars[rnum];
  }
  return name;
}

function removeFromArray(array, element) {
  var idx = array.indexOf(element);
  array.splice(idx, 1);
}

var port = process.env.PORT || 3000;
app.listen(port);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);

