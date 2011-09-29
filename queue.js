var io;

var MAX_HISTORY = 3;     // max number of previously played songs to keep
var NUM_TOP_SONGS = 3;   // number of songs displayed in the top songs list
// var curQ = {};           // current song queue per room. stores 'curIdx' and 'songs'
// curQ.songs[curIdx] has status = 'cur', if idx < curIdx then status = 'prev'. o/w status = 'next'
var spotify = require('./spotApi.js');
// var votes = {};          // indexed by room then songId then user

// var songs = {};          // represents mapping from songID to songInfo.
// NOTE: songInfo is also in curQ[room]...
// var unusedId = 0;        // Jankity jank

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
          // songObject.status = 'next';
          var songId = redis.addSong(songObject);
          redis.addSongToRoom(songId,room);

          // curQ[room].songs.push(songObject);
          // songs[songObject.id] = songObject;
          // votes[room][songObject.id] = {};
          io.sockets.in(room).emit('song add', songObject);
          // console.log("\n******curQ is: " + curQ[room].songs);
        }
      });
    });
  });

  // Start playing a song
  socket.on('song start', function(client){
    var userId = cookieHelper.getUserId(socket);
    var room = redis.getUserRoom(userId);

    //socket.get('room', function(err,room) {
      if(songTimeout[room] != null){
        clearTimeout(songTimeout[room]);
      }
      redis.changeSongs(room); //playNextSong(room);
      //});
  });

  // User changed vote
  socket.on('vote', function(songId, vote) {
    var userId = cookieHelper.getUserId(socket);
    var room = redis.getUserRoom(userId);
    var voteId = redis.getVoteId(userId, songId);
    var newSongAvg = redis.updateVote(songId, voteId, vote);
    var topSongs = redis.getTopSongs(room, NUM_TOP_SONGS);
    io.sockets.in(room).emit('vote topsongs', topSongs);
    io.sockets.in(room).emit('vote update', songId, newSongAvg);    
	  //socket.get('room', function(err,room) { // get room from socket
	  //votes[room][songId][socket.id] = vote;
	  //setSongAvg(songId,room);
	  //io.sockets.in(room).emit('vote topsongs', getTopSongs(room));
	  //});
  });

}

// function playNextSong(room) {
  // // if curIdx = 2 then we have 3 songs in the queue already, want to make sure
  // // we have 4 songs in the queue, meaning that we have a new song to go to
  // if(curQ[room].songs.length > curQ[room].curIdx+1){    
  //   if (curQ[room].curIdx >= 0) {
  //     curQ[room].songs[curQ[room].curIdx].status = 'prev';
  //   }
  //   if (curQ[room].curIdx == MAX_HISTORY) {  
  //     // if we have the max number of songs in history already, clear a song out
  //     // don't need to increment curIdx since songs get shifted
  //     curQ[room].songs.shift();
  //   }
  //   else {  // have to increment curIdx this time since no shift happened
  //     curQ[room].curIdx++;
  //   }
  //   console.log('\n******* curQ[room].curIdx:'+curQ[room].curIdx+' '+MAX_HISTORY+'******\n');
  //   var songInfo = curQ[room].songs[curQ[room].curIdx];
  //   songInfo.status = 'cur';
  //   songInfo.startTime = (new Date()).getTime();
  //   io.sockets.in(room).emit('song change', songInfo.href, 0,0);

  //   songTimeout[room] = setTimeout(function(){
  //     playNextSong(room);
  //   }, songInfo.length*1000);
  // }
// }

// function setSongAvg(songId, room) {
//   var avg = 0;
//   var numVotes = 0;
//   for(var key in votes[room][songId]) {
//     avg += votes[room][songId][key];
//     numVotes++;
//   }

//   console.log("votes so far: "+numVotes);
//   songs[songId].avg = avg / numVotes;
//   console.log('****songid:'+songId+' avg: '+songs[songId].avg+'****');
//   io.sockets.in(room).emit('vote update', songId, songs[songId].avg);
// }

this.addUser = function(socket, room){
    // addRoom will return false if the room already exists
    // otherwise it will initialize all the queue stuff for us
    if (!redis.addRoom(room, function(){})) {// if (room in curQ){  // if the room already exists, increment counts
     // start song playback
      var curSong = redis.getRoomCurSong(room);//   if (curQ[room].curIdx >= 0) {
      if (curSong != '') {//     var curSong = curQ[room].songs[curQ[room].curIdx];
        curSong = JSON.parse(curSong);
  //     if (curSong.status == 'cur') {   // current song might be over
         var diff = (new Date()).getTime() - curSong.startTime;
         socket.emit('song change', curSong.href, Math.floor(diff/(1000*60)), Math.floor((diff/1000)%60));  // start playback
      }
    // send current song queue to user.  probably a better way to do this?
    // also should probably make sure that the next/prev/cur songs exist
      var songQueue = redis.getRoomPrevSongs(room);
      for(var song in songQueue) {
	  socket.emit('song add prev', songQueue[song]);
      }
      socket.emit('song add cur', redis.getRoomCurSong(room));
      songQueue = redis.getRoomNextSongs(room);
      for(var song in songQueue) {
	  socket.emit('song add next', songQueue[song]);
      }    

    }
  //     }
  //   }
  // }
  // else {   
  //   curQ[room] = {curIdx:-1, songs:[]};
  //   votes[room] = {}
  //}


  
  // for(song in curQ[room].songs){
  //   socket.emit('song add', curQ[room].songs[song]);
  // }

}

this.disconnect = function(socket, room){
    var userId = cookieHelper.getUserId(socket);
    var userVotes = redis.getUserVotes(userId);
    for(var voteId in userVotes) {
      redis.removeVote(voteId);
    }
  // for(var song in curQ[room].songs){
  //   var songId = curQ[room].songs[song].id;
  //   console.log('\n********songid:'+songId +'********');
  //   votes[room][songId][socket.id] = 0;
  //   setSongAvg(songId,room);
  // }
}

// function used to sort the song queue based on song avg votes
// songs come from curQ[room].songs
// function sortSongsByAvg(song1, song2) {
//     return songs[song2.id].avg - songs[song1.id].avg;
// }

// // returns a list containing the top 3 songs in the queue right now
// function getTopSongs(room) {
//   var topSongs = [];
//   var queue = curQ[room].songs;
//   queue.sort(sortSongsByAvg);
//   for(var i=0; i<NUM_TOP_SONGS && i<queue.length; i++) {
//       topSongs[i] = queue[i];
//   }
//   return topSongs;
// }

module.exports = this;
