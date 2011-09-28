var sanitize = require('validator').sanitize,
    check = require('validator').check;

var io;
var namer = require('./names.js');
var sessionStore;

//var users = {};          // keeps track of user name per room
//var clients = [];        // keeps track of info per socket

var redis;
var cookieHelper;

this.initChat = function(socketIO, sessStore, rdb, ckh){
  io = socketIO;
  sessionStore = sessStore;
  redis = rdb; 
  cookieHelper = ckh;
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

    var userId = cookieHelper.getUserId('this should be something', socket);
    var room = redis.getUserRoom(userId);     // room name is returned
    //socket.get('room', function(err, room) {
      // Check for repeat names
	    //	          if (room in users) { 
       if (redis.isNameTaken(name,room)) { //users[room].indexOf(name) >= 0) {
          //socket.emit('chat name error', "Someone else is using that name.");
          socket.emit('chat message', 'system', 'Someone else is using that name.');
          name = namer.numberIt(name);
        }
        if (name.length >= 25) {
          //socket.emit('chat name error', "Your name must be less than 25 characters long.");
          socket.emit('chat name', 'system', 'Your name must be less than 25 characters long.');
          name = namer.generalName();
        }

        var oldName = redis.setUserName(userId,room,name);

        //removeFromArray(users[room], clients[socket.id].name);  // Remove old name
        //users[room].push(name);  

        //io.sockets.in(room).emit('chat message', 'system', clients[socket.id].name+' is now known as '+name);
        io.sockets.in(room).emit('chat message', 'system', oldName+' is now known as '+name);
        //clients[socket.id].name = name;
        sessionStore.get(socket.handshake.sessionID, function(err, session){
          // save new name in cookie
          if(!err && session){
            session.name = name;
            sessionStore.set(socket.handshake.sessionID, session);
          }
	    });
        socket.emit('chat name', name);
	    //		  }
    //});
  });

  // Send message to everyone in the room
  socket.on('chat message', function(msg) {
    var userId = cookieHelper.getUserId('this should be something', socket);   
    //var name = clients[socket.id].name;
    var userName = redis.getUserName(userId);
    var room = redis.getUserRoom(userId);
    //socket.get('room', function(err,room) {
      var cleanedMsg = sanitize(msg).xss();  // Sanitize message
      socket.broadcast.to(room).emit('chat message', userName, cleanedMsg, false);  // doesn't get sent back to the originating socket
      socket.emit('chat message', userName, cleanedMsg, true);   // send user cleaned version of their message
      //});
  });

  this.getName(socket);
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
    //clients[socket.id] = {name : chatName};
    var userId = cookieHelper.getUserId('this should be something', socket);   
    var room = redis.getUserRoom(userId);
    //socket.get('room', function(err, room) {
      redis.setUserName(userId,room, chatName);
      socket.emit('chat name', chatName);//clients[socket.id].name);
      if(session) {
        session.name = chatName;
      
        sessionStore.set(socket.handshake.sessionID, session);
      }
      //});
  });
}

this.addUser = function(socket, room){
    // if the room exists, add the new name
  var userId = cookieHelper.getUserId('this should be something', socket);   
  if(redis.doesRoomExist(room)){ //room in users){ 
      //users[room].push(clients[socket.id].name);
      redis.addUserToRoom(userId, room);
  }
  else{ // create a new room
      // users[room] = [clients[socket.id].name];
      redis.createRoom(userId, room);
  }

  // update users info for everyone in the room
  var roomUsers = redis.getUsersInRoom(room);
  // io.sockets.in(room).emit('chat users', users[room]);
  var userName = redis.getUserName(userId);
  //socket.broadcast.to(room).emit('chat message', 'system', clients[socket.id].name + ' connected');
  socket.broadcast.to(room).emit('chat message', 'system', userName+ ' connected');
  socket.emit('chat message', 'system', 'Now listening in: ' + room);
}

this.disconnect = function(socket, room){
  if(redis.doesRoomExist(room) ){ //room in users) { 
    var userId = cookieHelper.getUserId('this should be something', socket);   
    var name = redis.getUserName(userId);//clients[socket.id].name;
    //removeFromArray(users[room], name);
    redis.removeUserFromRoom(userId, room);
    var roomUsers = redis.getUsersInRoom(room);
    //io.sockets.in(room).emit('chat users', users[room]);
    io.sockets.in(room).emit('chat users', roomUsers);;
    io.sockets.in(room).emit('chat message', 'system', name+' left');
    // maybe get rid of room from the users hashes if no one's in them?
  }
}

function removeFromArray(array, element) {
  var idx = array.indexOf(element);
  array.splice(idx, 1);
}


module.exports = this;
