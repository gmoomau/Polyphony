var sanitize = require('validator').sanitize,
    check = require('validator').check;

var io;
var namer = require('./names.js');
var sessionStore;

var redis;
var cookieHelper;

this.initChat = function(socketIO, sessStore, rdb, ckh){
  io = socketIO;
  sessionStore = sessStore;
  redis = rdb; 
  cookieHelper = ckh;
}

this.beginChat = function(socket){
  // Change the chat name for a client
  socket.on('chat name', function(name) {
    console.log('\n******** changing chat name');
    // Sanitize name
    try{
      check(name).regex(/^[-a-z0-9 _]+$/i);
    }
    catch (e){
      name = namer.hackerName();
    }
    if (name.length >= 25) {
       socket.emit('chat name', 'system', 'Your name must be less than 25 characters long.');
       name = namer.generalName();
    }

    cookieHelper.getClientId(socket, function(clientId) {
        redis.waitOn([redis.getClientRoom, [clientId]], [redis.getClientName, [clientId]], function(room,oldName) {
            redis.setClientName(clientId,room,name, function(err,setName) {
               if(setName != name) {
                  socket.emit('chat message', 'system', 'Someone else is using that name.');
               }

               io.sockets.in(room).emit('chat message', 'system', oldName+' is now known as '+setName);
               sessionStore.get(socket.handshake.sessionID, function(err, session){
                      // save new name in cookie
                      if(!err && session){
                          session.name = setName;
                          sessionStore.set(socket.handshake.sessionID, session);
                      }
                });
                socket.emit('chat name', setName);
          });  // end set client name
       });  // end waitOn
    }); // end of cookieHelper

  }); // end of on 'chat name'


  // Send message to everyone in the room
  socket.on('chat message', function(msg) {
    cookieHelper.getClientId(socket, function(clientId) {
            redis.waitOn([redis.getClientRoom, [clientId]], [redis.getClientName, [clientId]], function(room,clientName) {
           var cleanedMsg = sanitize(msg).xss();  // Sanitize message
           socket.broadcast.to(room).emit('chat message', clientName, cleanedMsg, false);  // doesn't get sent back to the originating socket
           socket.emit('chat message', clientName, cleanedMsg, true);   // send client cleaned version of their message
      }); // end wait on
   }); // end cookie helper
  }); // end socket on message

  this.getName(socket);
}

// is called when client first connects and may have no room associated
this.getName = function(socket){
    console.log('\n************* chat getName');
  var chatName = '';
  sessionStore.get(socket.handshake.sessionID, function(err, session){
    if(!err && session && session.name){
      chatName = session.name;
    }
    else{
      chatName = namer.generalName();
    } 

    cookieHelper.getClientId(socket, function(clientId) {
        redis.getClientRoom(clientId, function(err, room) {
          // name we want might be taken so we accept the set name here
                    redis.setClientName(clientId,room,chatName, function(err,setName) {
                       console.log('\n\n******* SET NAME TO: ' + setName);
                       socket.emit('chat name', setName);
                       if(session) {
                           session.name = setName;      
                           sessionStore.set(socket.handshake.sessionID, session);
                       }
              }); //end set clientname
           }); // end get client room
        });   // end cookiehelper
   });
 console.log('\n************** end of chat get name ');
}

this.addClient = function(socket, room, callback){
  cookieHelper.getClientId(socket, function(clientId) {
    redis.addClientToRoom(clientId, room, function(err) {   // will create the room if needed
      // update clients info for everyone in the room
        redis.waitOn([redis.getClientsInRoom, [room]], [redis.getClientName, [clientId]], function(roomClients,clientName) {
          console.log('\n********** add client waitOn results ', roomClients, clientName);
          socket.broadcast.to(room).emit('chat message', 'system', clientName+ ' connected');
          socket.emit('chat message', 'system', 'Now listening in: ' + room);
          io.sockets.in(room).emit('chat clients', roomClients);
          callback();
     });
    });
  });

}

this.disconnect = function(socket, room){
   cookieHelper.getClientId(socket, function(clientId) {
       redis.waitOn([redis.getClientName,[clientId]], [redis.removeClientFromRoom, [clientId, room]], function(name,unused) {
          redis.getClientsInRoom(room, function(err,roomClients) {
                 io.sockets.in(room).emit('chat clients', roomClients);
               io.sockets.in(room).emit('chat message', 'system', name+' left');
           });
       });
    });
}

module.exports = this;
