var io;

var MAX_HISTORY = 3;     // max number of previously played songs to keep
var curQ = {};           // current song queue per room. stores 'curIdx' and 'songs'
// curQ.songs[curIdx] has status = 'cur', if idx < curIdx then status = 'prev'. o/w status = 'next'
var spotify = require('./spotApi.js');
var votes = {};          // indexed by room then songId

var songs = {};          // represents mapping from songID to songInfo.
// NOTE: songInfo is also in curQ[room]...
var unusedId = 0;        // Jankity jank

var songTimeout = {};     // indexed by room

this.initQueue = function(socketIO) {
  io = socketIO;
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
          songObject.status = 'next';
          songObject.id = unusedId++;
          songObject.room = room;
          curQ[room].songs.push(songObject);
          songs[songObject.id] = songObject;
          votes[room][songObject.id] = 0;
          io.sockets.in(room).emit('song add', songObject, 0);
          console.log("\n******curQ is: " + curQ[room].songs);
        }
      });
    });
  });

  // Start playing a song
  socket.on('song start', function(client){
    socket.get('room', function(err,room) {
      if(songTimeout[room] != null){
        clearTimeout(songTimeout[room]);
      }
      playNextSong(room);
    });
  });

  // User changed vote
  socket.on('vote', function(songId, vote) {
    socket.get('room', function(err,room) { // get room from socket
      var user = socket.id;
      votes[room][songId] += parseInt(vote);
      curQ[room].songs.sort(songListSort); // reorder songlist
      io.sockets.in(room).emit('vote update', songId, votes[room][songId]);
      // once redis is here, have user upvote and downvote lists
    });
  });

}

function songListSort(a, b){
  // return number < 0 if a should be before b
  // a is before be if a has a higher score
  // if the scores are equal choose the song with the higher id

  var aScore = votes[a.room][a.id];
  var bScore = votes[b.room][b.id];

  if(aScore == bScore){
    // if a has a lower id, this will be negative
    return a.id - b.id;
  }
  else{
    // if a has a higher score, this will be negative
    return bScore - aScore;
  }
}

function playNextSong(room) {
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
    io.sockets.in(room).emit('song change', songInfo.href, 0,0);

    songTimeout[room] = setTimeout(function(){
      playNextSong(room);
    }, songInfo.length*1000);
  }
}

this.addUser = function(socket, room){
  if (room in curQ){  // if the room already exists, increment counts
    // start song playback
    if (curQ[room].curIdx >= 0) {
      var curSong = curQ[room].songs[curQ[room].curIdx];
      if (curSong.status == 'cur') {   // current song might be over
        var diff = (new Date()).getTime() - curSong.startTime;
        socket.emit('song change', curSong.href, Math.floor(diff/(1000*60)), Math.floor((diff/1000)%60));  // start playback
      }
    }
  }
  else {   // otherwise we have to set the counts
    curQ[room] = {curIdx:-1, songs:[]};
    votes[room] = {}
  }

  // send current song queue to user
  for(song in curQ[room].songs){
    var tmpSong = curQ[room].songs[song];
    socket.emit('song add', tmpSong, votes[room][tmpSong.id]);
  }

}

this.disconnect = function(socket, room){
  /*for(var song in curQ[room].songs){
    var songId = curQ[room].songs[song].id;
    console.log('\n********songid:'+songId +'********');
    votes[room][songId][socket.id] = 0;
    //setSongAvg(songId,room);
  }*/
  // for now, do nothing
}

module.exports = this;
