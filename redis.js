var redis = require('redis');
var redisClient = redis.createClient();
var namer = require('./names.js');

// initializes stuff for our redis connection.
// for now sets all of the necessary next ids to be 0
// but in the future this might not be necessary once the 
// redis db has been created/used
this.initRedis = function() {
  redis.debug_mode = true;
  redisClient.flushall();
  redisClient.set('next.user.id', 0);
  redisClient.set('next.vote.id', 0);
  redisClient.set('next.queue.id', 0);
  redisClient.set('next.song.id', 0);
}

// callback should accept a single argument, the new id
this.getNewUserId = function(callback) {
    redisClient.incr('next.user.id', function(err,newid) {
         callback(newid);
    });
}


this.isNameTaken = function (name, roomName, callback) {
    // check room to see if the given name is taken
    redisClient.sismember('room:'+roomName+'user.names',name, 
      function(err,reply) {
         return reply;
    });
}

// if user name is already taken in the room, then we add digits to it to 
// make it unique
// if roomName == null, then we ignore that check entirely
this.setUserName = function(userId, roomName, newName, callback) {
    console.log('\n************ changing user name');
    var taken = false;
    // Get old user name
    redisClient.get('user:'+userId+':name', 
      function(err, oldName) {
        if (roomName != null) {
           var roomUsersSet = 'room:'+roomName+':user.names';
           // Remove old user name from room.usernames and user (if they exist)
           redisClient.srem(roomUsersSet, oldName, function(err,res){})
           var notAdded = false;
           // Set username in the room if it doesn't exist
           // if it does exist, modify the name w/ numbers and then try again
           while(notAdded) {
               redisClient.sadd(roomUsersSet, newName, function(err,reply){
                  // reply is the # of elements added to the set. is 0 if the name was already in there
	           if(reply== 1) { 
                      notAdded = false;
                   }
                   else {
                      newName = namer.numberIt();
                      taken = true;
                   }
	       });
           }
        }
        // Set new name for user
        redisClient.set('user:'+userId+':name', newName, function(err,res) {});

      });
  // return false if username was taken
  return taken;
}


this.getUserName = function(userId, callback) {
    // return the user's name
    redisClient.get('user:'+userId+':name',
      function(err, name) {
         return name; 
      }
    );

}

this.getUserRoom = function(userId, callback) {
    // return the name of the room that the user is in
    redisClient.get('user:'+userId+':room', 
      function(err,roomName) {
         return roomName;
      });
}

this.getRoomNextSongs = function(roomName, callback) {
    // get the songs from the next up queue 
    redisClient.get('room:'+roomName+':next.songs',
      function(err, nextSongs) {
         return nextSongs;
      });
}

this.getRoomCurSong = function(roomName, callback) {
    redisClient.get('room:'+roomName+':cur.song',
      function(err, curSong) {
         return curSong;
      });
}

this.getRoomPrevSongs = function(roomName, callback) {
    redisClient.get('room:'+roomName+':prev.songs',
      function(err, prevSongs) {
         return prevSongs;
      });
}


this.removeVote = function(voteId, callback) {
    // get the vote's value and vote's songId
    // subtract value from the song's vote.total
    // remove vote from the song's set of votes
    // remove vote from the db
}

this.doesRoomExist = function(roomName, callback) {
    // return true if the room already exists
    return true;
}

this.addRoom = function(roomName, callback) {
    // add a new room with a given roomName to the server
    // be sure to use SETNX for this stuff to avoid race condition
    // when two users try to add a room at the same time
    // return false if room already exists. o/w return true
}

this.addUserToRoom = function(userId, roomName, callback) {
    // set user's room id
    // add user's id and user's name to the room
}

this.removeUserFromRoom = function(userId, roomName, callback) {
    // remove roomName from user's room id
    // remove username and user id from room
}

this.getUsersInRoom = function(roomName, callback) {
    // returns a list of user id/names
    return [];
}


// Takes a song object, converts it to a string and adds it
// to the database.  Returns the id of the song
this.addSong = function(songObj, callback) {
    // Get a new id for the song and set it
    // Convert object to a string
    // Add spotifyObject, votes and vote.total to the database
    return 1;
}

this.addSongToRoom = function(songId, roomName, callback) {
    // add song to the room's next.songs sorted set
}

this.getNewSongId = function(, callback) {
    redisClient.incr('next.user.id', function(err,newid) {
       if(!err) { 
         return newid;
       }
    });   
}

this.getNewVoteId = function(, callback) {
    // returns a new vote Id which can be used
    return 1;
}

this.getVoteId = function(userId, songId, callback) {
    // return the id of the vote associated with this user and song
    // get it by intersecting the user's vote list and song's vote list
    // return a new id if the vote is not found
    return 1;
}

this.updateVote = function(songId, voteId, newValue, callback) {
    // get the old vote value, and subtract it from the song's vote total
    // updates a votes value, and add newValue to the song's vote total
    // set value of song in sorted set 
    // returns the new score of the song / number of users by calling getSongAvg
    return 75;
}

this.getSongAvg = function(songId, callback) {
    // compute the song's new score 
    // return the song's new voter average
    return 75;
}

this.getTopSongs = function(roomName, numSongs, callback) {
    // Get the top numSongs number of song objs from the room's next queue
    // and return it
    return [];
}

module.exports = this;
