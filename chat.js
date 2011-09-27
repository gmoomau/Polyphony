var sanitize = require('validator').sanitize,
    check = require('validator').check;

var io;
var namer;
var sessionStore;

var users = {};          // keeps track of user name per room
var clients = [];        // keeps track of info per socket

this.initChat = function(io, sessStore, namer){
  this.io = io;
  this.sessionStore = sessStore;
  this.namer = namer;
}

this.beginChat = function(socket){

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
          //socket.emit('chat name error', "Someone else is using that name.");
          socket.emit('chat message', 'system', 'Someone else is using that name.');
          name = namer.numberIt(name);
        }
        if (name.length >= 25) {
          //socket.emit('chat name error', "Your name must be less than 25 characters long.");
          socket.emit('chat name', 'system', 'Your name must be less than 25 characters long.');
          name = namer.generalName();
        }

        removeFromArray(users[room], clients[socket.id].name);  // Remove old name
        users[room].push(name);  

        io.sockets.in(room).emit('chat message', 'system', clients[socket.id].name+' is now known as '+name);
        clients[socket.id].name = name;
        sessionStore.get(socket.handshake.sessionID, function(err, session){
          // save new name in cookie
          if(!err && session){
            session.name = name;
            sessionStore.set(socket.handshake.sessionID, session);
          }
        });
        socket.emit('chat name', name);
      }
    });
  });

  // Send message to everyone in the room
  socket.on('chat message', function(msg) {
    var name = clients[socket.id].name;

    socket.get('room', function(err,room) {
      var cleaned = sanitize(msg).xss();  // Sanitize name
      socket.broadcast.to(room).emit('chat message', name, cleaned, false);  // doesn't get sent back to the originating socket
      socket.emit('chat message', name, cleaned, true);   // send user cleaned version of their message
    });
  });

  getName(socket);
}

this.getName = function(socket){
  var chatName = '';
  sessionStore.get(socket.handshake.sessionID, function(err, session){
    if(!err && session && session.name){
      chatName = session.name;
    }
    else{
      chatName = namer.generalName();
    } 
    clients[socket.id] = {name : chatName};
    socket.emit('chat name', clients[socket.id].name);
    if(session) {
      session.name = chatName;
      sessionStore.set(socket.handshake.sessionID, session);
    }
  });
}

this.addUser = function(socket, room){
  if(room in users){ // if the room exists, add the new name
    users[room].push(clients[socket.id].name);
  }
  else{ // create a new room
    users[room] = [clients[socket.id].name];
  }

  // update users info for everyone in the room
  io.sockets.in(room).emit('chat users', users[room].length);
  socket.broadcast.to(room).emit('chat message', 'system', clients[socket.id].name + ' connected');
  socket.emit('chat message', 'system', 'Now listening in: ' + room);
}

this.disconnect = function(socket, room){
  socket.get('room', function(err, room) {
    if(room != null && room in users) { 
      var name = clients[socket.id].name;
      removeFromArray(users[room], name);
      io.sockets.in(room).emit('chat users', users[room].length);
      io.sockets.in(room).emit('chat message', 'system', name+' left');
      // maybe get rid of room from the users hashes if no one's in them?
    }
  });
}

module.exports = this;
