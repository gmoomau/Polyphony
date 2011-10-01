var io;

var MAX_HISTORY = 3;     // max number of previously played songs to keep
var NUM_TOP_SONGS = 3;   // number of songs displayed in the top songs list
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
    // if song is valid, get info
    spotify.apiLookup(song, function(songInfo){
      socket.get('room', function(err,room) {
        if(err){
          console.log(err);
        }
        else{
          var songObject = JSON.parse(songInfo).track;
          redis.addSong(songObject, function(songId) {
             redis.addSongToRoom(songId,room, function(){  // wait until song is added to alert users (in case something bad happens/so they can't vote)
                     console.log('\n\n*********** songid: ' + songId + ' ' + songObject.name);
                     io.sockets.in(room).emit('song add', songObject, songId, 'next');
                     console.log('\n\n*********** '+io.sockets.in(room));
             });   
          });
        }
      });  // end get room
    });  // end apiLookup
  });  // end of song add

  // Start playing a song
  socket.on('song start', function(client){
    cookieHelper.getUserId(socket, function(userId) {
       redis.getUserRoom(userId, function(room) {
         if(songTimeout[room] != null){
           clearTimeout(songTimeout[room]);
         }
         redis.changeSongs(room, function(){}); 
       });
    });
  });

  // User changed vote
  socket.on('vote', function(songId, vote) {
     console.log('\n\n************* user is voting!' + songId + ' ' +vote);
     // get the user's id
     cookieHelper.getUserId(socket, function(userId) {
        // get the room for sending message later, also get the vote to update
        redis.waitOn([redis.getUserRoom, [userId]], [redis.getVoteId, [userId, songId]], function (room, voteId) {
          console.log('\n\n************* vote: done waitOn!' + room + ' ' +voteId);
           // update the vote for the user
           redis.updateVote(songId, voteId, vote, function(newSongAvg) {
              console.log('\n\n************* updated vote!' + songId + ' ' +vote);
              // find the new top songs now that the song's score has changed
              redis.getTopSongs(room, NUM_TOP_SONGS, function(topSongs) {
                 // emit the top songs to users in the room
                 io.sockets.in(room).emit('vote topsongs', topSongs);
                 console.log('\n\n************* songId, newSongAvg' + songId + ' ' +newSongAvg);
                 io.sockets.in(room).emit('vote update', songId, newSongAvg);
              });
           });
        });   // end waitOn 
     });
  });

}

this.addUser = function(socket, room){
    // addRoom will return false if the room already exists
    // otherwise it will initialize all the queue stuff for us
  cookieHelper.getUserId(socket, function(userId) {
    redis.addUserToRoom(userId, room, function() {
       // start song playback
       redis.getRoomCurSong(room, function(curSong) {
         if (curSong != '') {
            curSong = JSON.parse(curSong);
            var diff = (new Date()).getTime() - curSong.startTime;
            socket.emit('song change', curSong.href, Math.floor(diff/(1000*60)), Math.floor((diff/1000)%60));  // start playback
         }
       });
      // send current song queue to user.  probably a better way to do this?
       console.log('\n\n************* queue waitOn');
        redis.waitOn([redis.getRoomPrevSongs, [room]], [redis.getRoomCurSong, [room]], [redis.getRoomNextSongs, [room]], function(prevSongs, curSong, nextSongs) {
          for(var song in prevSongs){
              console.log('\n\n******** sending prev queue');
              socket.emit('song add', prevSongs[song],0,'prev');
          }
          if (curSong != '') {
              console.log('\n\n******** sending cur queue');
              socket.emit('song add', curSong, 0, 'cur');
          }
          for(var song in nextSongs) {
              console.log('\n\n******** sending next queue');
              socket.emit('song add', nextSongs[song], 0, 'next');
          }    
       });
    });
 });  // end cookieHelper
}

this.disconnect = function(socket, room){
   cookieHelper.getUserId(socket, function(userId) {
     redis.getUserVotes(userId, function(userVotes) {
       for(var voteId in userVotes) {
         redis.removeVote(voteId, function(unused){});
       }
     });
   });
}


module.exports = this;
