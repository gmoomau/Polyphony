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
  redisClient.sadd('empty.set', '');  // since sets can't be empty need to add an empty string to them, see NOTE in redis-template, or at the bottom of this file
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
// return the user name that we ended up setting (can be different from what was
//  requested if the name was taken)
this.setUserName = function(userId, roomName, newName, callback) {
    console.log('\n************ changing user name');
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
                   }
	       });
           }
        }
        // if roomName != null it won't get here until after going through the while, right?
        // Set new name for user
        redisClient.set('user:'+userId+':name', newName, function(err,res) {
           callback(newName);
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
    redisClient.get('user:'+userId+':room.name', 
      function(err,roomName) {
          console.log('\n\n*********** user room:' + userId + ' ' + roomName);
          callback(roomName);
      });
}

this.getRoomNextSongs = function(roomName, callback) {
    // get the songs from the next up queue 
    redisClient.zrevrange('room:'+roomName+':next.songs', 0,-1,
      function(err, nextSongs) {
          if (nextSongs == null) { callback([]);}
          else{        callback(nextSongs); }
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


this.getUsersInRoom = function(roomName, callback) {
  // should return a list of user ids and names, but for now
  // just returns the user ids
  self.getSet('room:'+roomName+':user.ids', function(users) {
     console.log('\n\n*********** USERS IN ROOM : ' + users);
     callback(users);
  });
}

// Takes a song object, converts it to a string and adds it
// to the database.  Returns the id of the song
this.addSong = function(songObj, callback) {
    // Get a new id for the song and set it
    self.getNewSongId(function(id) {
      console.log('\n\n************* newSongId: '+id);
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

this.addSongToRoom = function(songObject, roomName, callback) {
    var songStr = JSON.stringify(songObject);
    // add song to the room's next.songs sorted set with a value of 0
    redisClient.zadd('room:'+roomName+':next.songs', 0, songStr, function(err,res) {
       redisClient.zrevrange('room:'+roomName+':next.songs', 0,-1, function(err,res) {
            console.log('\n********** nextsongs after addSongToRoom' + res);});

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
         console.log('\n\n************* getNewVoteId' + newid);
         callback(newid);
    });   
}


this.getTopSongs = function(roomName, numSongs, callback) {
    // Get the top numSongs number of song objs from the room's next queue
    // and return it
    console.log('\n\n*********** TOP SONGS ROOM: '+roomName);
    redisClient.zrevrange('room:'+roomName+':next.songs', 0,numSongs-1, function(err,results) {
       console.log('\n\n******** TOP SONG RESULTS: ' + err + ' ' + ' ' + results);
       callback(results);
    });
}


this.getUserVotes = function(userId, callback) {
   self.getSet('user:'+userId+':votes', function(members) {
       callback(members);
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
       .setnx('room:'+roomName+':cur.song', '')
       .exec(function(err,replies) {
           // no return 
           callback();
       });
}

// no return
this.addUserToRoom = function(userId, roomName, callback) {

    function add(addRoomResult) {
        self.doesRoomExist(roomName, function(val) {
            console.log('\n\n********* DOES ROOM EXIST IN ADD ROOM: ' + val);          
        });
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
    console.log('\n\n*********** removing user from room');
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
      console.log('\n\n************* results from getVote! "' + res+'"');
      if (res[0] == null){        // res is some object no matter what apparently. i.e. if the vote wasn't found, (res == null) -> false
         console.log('\n\n************* vote not found! ');
        // return a new id if the vote is not found
         self.getNewVoteId(function(newid) {
             console.log('\n\n************* new vote id!' + newid);
             // Add the new song id to the user's and song's vote set
             self.waitOn([redisClient.sadd, ['song:'+songId+':votes', newid]],
                         [redisClient.sadd, ['user:'+userId+':votes', newid]],
                         [self.getUserRoom, [userId]],
                         function(add1,add2, roomName) { 
                         // also need to initialize the vote object
                           self.waitOn([redisClient.set, ['vote:'+newid+':song.id', songId]],
                                       [redisClient.set, ['vote:'+newid+':value', 0]],
                                       [redisClient.set, ['vote:'+newid+':room.name', roomName]],
                           function() {
                              callback(newid);
                           });
                         });
         });
      }
      else {
        console.log('\n\n************* vote found! ' + res[0] + ' ' + typeof(res[0]));
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
            .incrby('song:'+songId+':votes.total', diff)
            .scard('song:'+songId+':votes')
            .get('vote:'+voteId+':room.name')
            .get('song:'+songId+':spotify.obj')
            .set('vote:'+voteId+':value',newValue)
            .exec(function(err, replies) { 
              var voteTotal = replies[0];
              var voteCount = replies[1] - 1 ;  // sub 1 for the empty string
              var roomName = replies[2];
              var songStr = replies[3];
              // set value of song in sorted set  
             console.log('\n******** UPDATE VOTE ROOM NAME ' + roomName);
             redisClient.zadd('room:'+roomName+':next.songs', voteTotal, songStr, function(err,res) {
                 redisClient.zrevrange('room:'+roomName+':next.songs', 0,-1, function(err2,res2) {
                    if(err || err2) { console.log('\n\n************* ERROR ERROR ERROR in update Vote ****************');}
                    console.log('\n********** nextsongs after update vote ' + res2);
                    console.log('\n********** NEW VOTE TOTAL ' + voteTotal+'\n******'+songStr);
                 })
                    // returns the new score of the song / number of users
                 callback(voteTotal / voteCount);
               });
           });
    });

}

// The following two things are wrapper calls around
// redisClient.smembers and redisClient.scard b/c sets may have an 
// empty string in them which should be ignored for these purposes
// 
// apparently you can't have an empty set, so when sets are init'd i add an empty string to them. 
this.getSet = function(setKey, callback) {
   redisClient.sdiff(setKey, 'empty.set', function(err, mems) {
       console.log('\n******** SET MEMBERS : '+mems);
       if (mems == null) {
           console.log('\n********* set is null');
           callback([]);
       }
       else {
          callback(mems);
       }
   });
}

this.getSetSize = function(setKey, callback) {
   redisClient.sdiff(setKey,'empty.set', function(err, res) {
       console.log('\n********** setSize diff: ' + res);
       if(res == null) {
       console.log('\n********** setSize diff is null ');
         callback(0);
       }
       else {
       console.log('\n********** setSize diff is  '+res.length + ' long');
         callback(res.length);
       }
   });

}

this.changeSongs = function(roomName, callback) {
   // Get first thing from next songs,
   redisClient.zrange('room:'+roomName+':next.songs', -1, -1, function(err, highestSong) {
     if (highestSong != '') {
       // parse the nextSongStr into a JSON object so we can add a .startTime
       var songObj = JSON.parse(highestSong);
       songObj.startTime = (new Date()).getTime();
       var songStr = JSON.stringify(songObj);
       redisClient.get('room:'+roomName+':cur.song', function(err, cursong) {
          if(cursong != '') {      // Push cursong onto prev songs and LTRIM that list
              redisClient.lpush('room:'+roomName+':prev.songs', cursong, function(err, res) {
                redisClient.ltrim('room:'+roomName+':prev.songs', 0,2);
             });
          }
         
          // set highestSong to be the rooms current song, and remove it from the next songs list
          redisClient.set('room:'+roomName+':cur.song', songStr);

          redisClient.zrem('room:'+roomName+':next.songs', highestSong);
         // return the stringified version of the JSON object
         callback(songStr);       
       });     
     }
     else { // no next song
         callback('');
     }

   });
}

// this function takes any number of arguments arg1, arg2,..., argN, but expects:
// argN is a callback function to be called when all redis calls have returned
// arg1...argN-1 look like [redisFnToCall, redisArgs] note that redisArgs must be an array
//   so that we can push the appropriate callback into it
// when they've completed, callback will be called with the return values in order
//   eg: redisClient.waitOn([redisClient.getUserName, [3]], [redisClient.getNewSongId, []], returnFn)
//       returnFn will be called as: returnFn(song3sAvg, newSongId);
// should be used anytime there are multiple calls that are needed, but don't rely on each
// other.  not necessarily just getter functions 
// CURRENTLY HAVE AN ISSUE IF THE FUNCTION NEEDS TO USE 'this'
//  To make this stuff work with the redis calls I always set the 'this'
//  value to be redisClient, however this could break other fns.
//  not sure how to use apply and *not* overwrite the 'this'
this.waitOn = function() {
  console.log('\n\n*********** waitOn called');
  var retVals = [];  // values returned from other redis calls
  var fnToIndex = {};    // maps the function called to the index it should have in retVals
  var returnFn = arguments[arguments.length-1];   // last argument is the fn to call when the waits are all done
  var valuesReturned = 0;       // keeps track of how many calls have been completed

  function complete() {
      // console.log('\n\n*********** waitOn values returned: '+ valuesReturned + ' need: ' +retVals.length);
      if(valuesReturned == retVals.length) {
        returnFn.apply(this, retVals);
      }
  }

   // I think the way this closure works is that i is what we want here.  I tested it out in a separate file at least.
   function makeCallback(index) {
     return function(redisVal) { //console.log('\n\n*********** callback index value ' + index); 
       retVals[index] = redisVal; ++valuesReturned; complete(); };  
   }


  for(var i=0; i<arguments.length-1; i++) {  // subtract 1 from arguments.length since last arg is the callback
     var redisFn = arguments[i][0];
     var redisFnArgs = arguments[i][1];
     retVals.push(true);  // push something into retVals so that it has the correct length
     fnToIndex[redisFn] = i;
     // console.log('\n\n*********** waitOn retvals length: ' + retVals.length);
     var redisCallback = makeCallback(i);
     redisFnArgs.push(redisCallback);    // add callback to the arguments for the redis call
       //console.log('\n\n************ redisFn ' + redisFn);
       //console.log('\n\n************ args: ' + redisFnArgs);
     redisFn.apply(redisClient, redisFnArgs);   // call the redis function with the correct arguments including callback.  don't want to overwrite the this value of the function
  }
}

module.exports = this;
