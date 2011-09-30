var redis = require('redis');
var redisClient = redis.createClient();
var namer = require('./names.js');
var self = this;   // keep this as a global so that we can use these functions from other functions


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
  redisClient.set('empty.string.set', '');  // since sets can't be empty need to add an empty string to them, see NOTE in redis-template, or at the bottom of this file
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
          callback(reply);
    });
}

// if user name is already taken in the room, then we add digits to it to 
// make it unique
// if roomName == null, then we ignore that check entirely
// return false if username was taken
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
        // if roomName != null it won't get here until after going through the while, right?
        // Set new name for user
        redisClient.set('user:'+userId+':name', newName, function(err,res) {
           callback(taken);
         });

      });
}


this.getUserName = function(userId, callback) {
    // return the user's name
    redisClient.get('user:'+userId+':name',
      function(err, name) {
          callback(name);
      }
    );

}

this.getUserRoom = function(userId, callback) {
    // return the name of the room that the user is in
    redisClient.get('user:'+userId+':room', 
      function(err,roomName) {
          callback(name);
      });
}

this.getRoomNextSongs = function(roomName, callback) {
    // get the songs from the next up queue 
    redisClient.zrange('room:'+roomName+':next.songs', 0,-1,
      function(err, nextSongs) {
           // might need to remove the empty string
           callback(nextSongs);
      });
}

this.getRoomCurSong = function(roomName, callback) {
    redisClient.get('room:'+roomName+':cur.song',
      function(err, curSong) {
          callback(curSong);
      });
}

this.getRoomPrevSongs = function(roomName, callback) {
    redisClient.lrange('room:'+roomName+':prev.songs',0,-1,
      function(err, prevSongs) {
          callback(prevSongs);
      });
}



this.doesRoomExist = function(roomName, callback) {
    // return true if the room already exists
    redisClient.exists('room:'+roomName+':user.ids', function(err,roomExists) {
      callback(roomExists);
   });
}


this.getNumUsersInRoom = function(roomName, callback) {
    // returns the number of users in a room
    self.getSetSize('room:'+roomName+':user.ids', function(size) {
      callback(size);
    });
}

// Takes a song object, converts it to a string and adds it
// to the database.  Returns the id of the song
this.addSong = function(songObj, callback) {
    // Get a new id for the song and set it
    redisClient.getNewSongId(function(err, id) {
      // Convert object to a string
      var songStr = JSON.stringify(songObj);
      // Add spotifyObject, votes and vote.total to the database as one unit
      redisClient.multi()
        .set('song:'+id+':spotify.obj', songStr)
        .sadd('song:'+id+':votes', '')
        .set('song:'+id+':vote.total', 0)
        .exec(function(err, replies) {
            callback(id);
        });
    });
}

this.addSongToRoom = function(songId, roomName, callback) {
    // add song to the room's next.songs sorted set with a value of 0
    redisClient.zadd('room:'+roomName+':next.songs', 0, songId, function(err,res) {
       callback();
    });
}

this.getNewSongId = function(callback) {
    redisClient.incr('next.song.id', function(err,newid) {
       if(!err) { 
           callback(newid);
       }
    });   
}

this.getNewVoteId = function(callback) {
    // returns a new vote Id which can be used
    redisClient.incr('next.vote.id', function(err,newid) {
         callback(newid);
    });   
}


this.getTopSongs = function(roomName, numSongs, callback) {
    // Get the top numSongs number of song objs from the room's next queue
    // and return it
    redisClient.zrange('room:'+roomName+':next.songs',0,2, function(err, results) {
       callback(results);
    });
}


this.removeVote = function(voteId, callback) {
    redisClient.get('vote:'+voteId+':song.id', function(err, songId) {
      // set the song's vote total and update the vote
      self.updateVote(songId, voteId, 0, function() {
         // remove vote from the song's set of votes
         redisClient.srem('song:'+songId+':votes', voteId, function(err, res) {
           // don't remove from user or db since we may do this only when
           // a user has switched rooms, so we can reuse the vote maybe?
           callback(true);
         });
      });
    });
}

this.addRoom = function(roomName, callback) {
    // add a new room with a given roomName to the server
    // be sure to use SETNX for this stuff to avoid race condition
    redisClient.multi()
       .sadd('room:'+roomName+':user.ids', '')
       .sadd('room:'+roomName+':user.names','')
       .zadd('room:'+roomName+':next.songs',-1, '')
       .setnx('room:'+roomName+':cur.song', '')
       .exec(function(err,replies) {
           // no return
           callback();
       });
}

// no return
this.addUserToRoom = function(userId, roomName, callback) {

    function add(addRoomResult) {
       // set user's room id and add user's id to room
       console.log('\n\n************ addUserToRoom');
       self.waitOn([redisClient.set, ['user:'+userId+':room.name', roomName]],[redisClient.sadd, ['room:'+roomName+':user.ids', userId]], callback);

    }

    // see if room exists, if not create it.
    redisClient.exists('room:'+roomName+':user.ids', function(err, exists) {
           console.log('\n\n************ SOMETHING SOMETHING');     
       if(!exists) {
           console.log('\n\n************ room doesnt exist');
           self.addRoom(roomName, add);     
       }
       else {
          console.log('\n\n************ room exists');
          add();
       }
    });

}

this.removeUserFromRoom = function(userId, roomName, callback) {
    // remove roomName from user's room id
    // remove username and user id from room
    self.getUserName(userId, function(name) {
       self.waitOn([redisClient.srem,['room:'+roomName+':user.ids', userId]],
              [redisClient.srem,['room:'+roomName+':user.names', name]],
              [redisClient.set,['user:'+userId+':room.name', '']],
             function() {
               callback(true);
            });
    });

}

this.getVoteId = function(userId, songId, callback) {
    // return the id of the vote associated with this user and song
    // get it by intersecting the user's vote list and song's vote list
    redisClient.sinter('song:'+songId+':votes', 'user:'+userId+':votes', function (err, res) {
      if (res.length == 0) {
        // return a new id if the vote is not found
         redisClient.getNewVoteId(function(err, newid) {
             callback(newid);
         });
      }
      else {
        callback(res[0]);
      }
    });
}

// need to ensure that the song being voted on is a next song before
// calling this function (most likely by hiding the vote bars on the clients
// end for all other songs
this.updateVote = function(songId, voteId, newValue, callback) {
    // get the old vote value, and subtract it from the song's vote total
    redisClient.get('vote:'+voteId+':value', function(err, value) {
       var diff = newValue - value;  // diff for the song's vote total
       // updates a votes value, and add diff to the song's vote total
       redisClient.multi()
            .incr('song:'+songId+':votes.total', diff)
            .scard('song:'+songId+':votes')
            .get('vote:'+voteId+':room.name')
            .get('song:'+songId+':spotify.obj')
            .exec(function(err, replies) { 
              var voteTotal = replies[0];
              var voteCount = replies[1];
              var roomName = replies[2];
              var songStr = replies[3];
              redisClient.set('vote:'+voteId+':value',newValue);
              // set value of song in sorted set  
             redisClient.zadd('room:'+roomName+':next.songs', voteTotal, songStr);
               // returns the new score of the song / number of users
              callback(voteTotal / voteCount);
              });
    });

}

// The following two things are wrapper calls around
// redisClient.smembers and redisClient.scard b/c sets may have an 
// empty string in them which should be ignored for these purposes
// 
// apparently you can't have an empty set, so when sets are init'd i add an empty string to them. 
this.getSet = function(setKey, callback) {
   redisClient.sdiff(setKey, 'empty.string.set', function(err, mems) {
       callback(mems);
   });
}

this.getSetSize = function(setKey, callback) {
   redisClient.sdiff(setKey,'empty.string.set', function(err, res) {
       callback(res.length);
   });

}


// this function takes any number of arguments arg1, arg2,..., argN, but expects:
// argN is a callback function to be called when all redis calls have returned
// arg1...argN-1 look like [redisFnToCall, redisArgs] note that redisArgs must be an array
//   so that we can push the appropriate callback into it
// when they've completed, callback will be called with the return values in order
//   eg: redis.waitOn([redis.getUserName, [3]], [redis.getNewSongId, []], returnFn)
//       returnFn will be called as: returnFn(song3sAvg, newSongId);
// should be used anytime there are multiple calls that are needed, but don't rely on each
// other.  not necessarily just getter functions or even redis calls, can be anything async
this.waitOn = function() {
  var retVals = [];  // values returned from other redis calls
  var fnToIndex = {};    // maps the function called to the index it should have in retVals
  var returnFn = arguments[arguments.length-1];
  var valuesReturned = 0;       // keeps track of how many calls have been completed

  function complete() {
      if(valuesReturned == retVals.length) {
        returnFn.apply(this, retVals);
      }
  }

  for(var i=0; i<arguments.length-1; i++) {  // subtract 1 from arguments.length since last arg is the callback
     var redisFn = arguments[i][0];
     var redisFnArgs = arguments[i][1];
     retVals.push(true);  // push something into retVals so that it has the correct length
     fnToIndex[redisFn] = i;

     var redisCallback = function(redisVal) { retVals[i] = redisVal; valuesReturned++; complete(); };  // I think the way this closure works is that i is what we want here.  I tested it out in a separate file at least.
     redisFnArgs.push(redisCallback);    // add callback to the arguments for the redis call
       console.log('\n\n************ redisFn ' + redisFn);
       console.log('\n\n************ args: ' + redisFnArgs);
     redisFn.apply(this, redisFnArgs);   // call the redis function with the correct arguments including callback
  }

}


module.exports = this;
