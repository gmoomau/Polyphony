var io;

var MAX_HISTORY = 3;     // max number of previously played songs to keep
var NUM_TOP_SONGS = 3;   // number of songs displayed in the top songs list
var MIN_RANK = 20;       // minimum rank a song needs to stay in the queue. below this level it will automatically be removed
var spotify = require('./spotApi.js');

var songTimeout = {};     // indexed by room

var redis;
var cookieHelper;

this.initQueue = function(socketIO, rdb, ckh) {
  io = socketIO;
  redis = rdb;
  cookieHelper = ckh;
}

this.prepareQueue = function(socket) {
  // Adds a song to the queue
  socket.on('song add', function(song){
   console.log('\n\n******** ADDING A NEW SONG');
    // if song is valid, get info
    spotify.apiLookup(song, function(songInfo){
      socket.get('room', function(err,room) {
        if(err){
          console.log(err);
        }
        else{
          var songObject = JSON.parse(songInfo).track;
          redis.addSong(songObject, function(err,songId) {
             redis.addSongToRoom(songId,room, function(err){  // wait until song is added to alert clients (in case something bad happens/so they can't vote)
                     console.log('\n\n*********** songid: ' + songId + ' ' + songObject.name);
                     io.sockets.in(room).emit('song add', songObject, songId, 'next');
                     console.log('\n\n*********** '+io.sockets.in(room));
                     redis.getClientName(socket.id, function(err, name) {
                         io.sockets.in(room).emit('chat message', 'system', name + ' added ' + songObject.artists[0].name + ' - ' + songObject.name);
                     });
             });   
          });
        }
      });  // end get room
    });  // end apiLookup
  });  // end of song add

  // Start playing a song
  socket.on('song start', function(client){
    cookieHelper.getClientId(socket, function(clientId) {
      redis.getClientRoom(clientId, function(err, room) {
         if(songTimeout[room] != null){
           clearTimeout(songTimeout[room]);
         }
         playNextSong(room, clientId);
       });
    });
  });

  // Client changed vote
  socket.on('vote', function(songId, vote) {
     console.log('\n\n************* client is voting!' + songId + ' ' +vote);
     // get the client's id
     cookieHelper.getClientId(socket, function(clientId) {
        // get the room for sending message later, also get the vote to update
             redis.waitOn([redis.getClientRoom, [clientId]], [redis.getVoteId, [clientId, songId]], function (room, voteId) {
          console.log('\n\n************* vote: done waitOn!' + room + ' ' +voteId);
           // update the vote for the client
          redis.updateVote(songId, voteId, vote, function(err,newSongAvg) {
              console.log('\n\n************* updated vote!' + songId + ' ' +vote);
              if (newSongAvg > MIN_RANK) {  // song good enough
                // find the new top songs now that the song's score has changed
                redis.getTopSongs(room, NUM_TOP_SONGS, function(err,topSongs) {
                   console.log('\n\n************* top songs being emitted: ' + topSongs);
                   // emit the top songs to clients in the room
                   io.sockets.in(room).emit('vote topsongs', topSongs);
                   console.log('\n\n************* songId, newSongAvg ' + songId + ', ' +newSongAvg);
                   io.sockets.in(room).emit('vote update', songId, newSongAvg);
                });
              }
              else {   // song sucks
                  //remove song from the queue and then send out top songs
                  redis.removeSong(songId, room, function() { // remove from server
                      redis.getTopSongs(room, NUM_TOP_SONGS, function(err, topSongs) {  // get new top songs
                          io.sockets.in(room).emit('vote topsongs', topSongs);
                      });
                      io.sockets.in(room).emit('song remove', songId);   // remove on client end
                      redis.getSongObj(songId, function(err, spotifyStr) { // need to send the message to users
                         var songObject = JSON.parse(spotifyStr);
                         io.sockets.in(room).emit('chat message', 'system', songObject.artists[0].name + ' - ' + songObject.name + ' was removed due to unpopularity');
                       });
                  });
              }
           });
        });   // end waitOn 
     });
  });

}

this.addClient = function(socket, room){
    // addRoom will return false if the room already exists
    // otherwise it will initialize all the queue stuff for us
  cookieHelper.getClientId(socket, function(clientId) {
       // start song playback
        redis.getRoomCurSong(room, function(err,curSongs) {
           var curSongRes = curSongs[0];
           if (curSongRes != null) {
              console.log('\n\n********** cur song: ' + curSongRes + ' \n******* id: ' + curSongRes.songId);
              var curSong = JSON.parse(curSongRes.songObj);
              redis.getRoomCurStart (room, function(err, startTime) {
                var diff = (new Date()).getTime() - startTime;
                socket.emit('song change', curSongRes.songId, curSong.href, Math.floor(diff/(1000*60)), Math.floor((diff/1000)%60), curSong.length);  // start playback
              });
           }
         });

      // send current song queue to client.  probably a better way to do this?
       console.log('\n\n************* queue waitOn');
            redis.waitOn([redis.getRoomPrevSongs, [room]], [redis.getRoomCurSong, [room]], [redis.getRoomNextSongs, [room]], function(prevSongs, curSong, nextSongs) {
          for(var song in prevSongs){
              console.log('\n\n******** sending prev queue ' + song);
              socket.emit('song add', JSON.parse(prevSongs[song].songObj), prevSongs[song].songId, 'prev');
          }
          for (var song in curSong) {
              console.log('\n\n******** sending cur queue');
              socket.emit('song add', JSON.parse(curSong[song].songObj), curSong[song].songId, 'cur');
          }
          for(var song in nextSongs) {
              console.log('\n\n*********** next queue: ' + nextSongs[song].songId + ' ' + nextSongs[song].songObj);
              socket.emit('song add', JSON.parse(nextSongs[song].songObj), nextSongs[song].songId, 'next');
          }    
       });
 });  // end cookieHelper
}

this.disconnect = function(socket, room){
   cookieHelper.getClientId(socket, function(clientId) {
      redis.getClientVotes(clientId, function(err,clientVotes) {
       for(var voteId in clientVotes) {
           console.log('\n\n****** ABOUT TO REMOVE VOTE ID ' + clientVotes[voteId]);
           redis.removeVote(clientVotes[voteId], function(err,unused){});
       }
     });
   });
}

// userCall = true means that a user hit the next song button
// which means that if the room is null we should do nothing rather than emit
// the song end
function playNextSong(room, clientId) {
   redis.changeSongs(room, function(err,curSongId, curSongStr){
     console.log('\n\n********* song changed. new song is: ' + curSongId + ' ' + curSongStr);
     if (curSongStr != null) {
         if(songTimeout[room] != null){
           clearTimeout(songTimeout[room]);
         }
        curSong = JSON.parse(curSongStr);
        io.sockets.in(room).emit('song change', curSongId, curSong.href, 0,0, curSong.length);
        // set timeout to call changeSongs again after appropriate timeout
        songTimeout[room] = setTimeout(function(){
            playNextSong(room,null);
            }, curSong.length*1000+600);  // add a little buffer for the user since the song won't immediately start b/c of network delay etc
        // find the new top songs now that a song is off the next song list
        redis.getTopSongs(room, NUM_TOP_SONGS, function(err,topSongs) {
            // emit the top songs to clients in the room
            io.sockets.in(room).emit('vote topsongs', topSongs);
        });
        if(clientId != null) {
          // tell users who changed tracks
          redis.getClientName(clientId, function(err, name) {
              io.sockets.in(room).emit('chat message', 'system', name + ' changed songs');
          });
        }

     }
     else if(clientId == null) {
        // No current song to play, get rid of currentlyPlaying on client?
        // Go to a state where we immediately start playing the next song to be added?
        io.sockets.in(room).emit('song end');
        io.sockets.in(room).emit('vote topsongs', []);
     }
   }); 

}

module.exports = this;
