var redis = require('redis');
var redisClient = redis.createClient();
var namer = require('./names.js');
var self = this;   // keep this as a global so that we can use these functions from other functions


// initializes stuff for our redis connection.
// for now sets all of the necessary next ids to be 0
// but in the future this might not be necessary once the 
// redis db has been created/used
this.initRedis = function() {
    //redis.debug_mode = true;
  redisClient.flushall();
  redisClient.set('next.user.id', 0);
  redisClient.set('next.vote.id', 0);
  redisClient.set('next.song.id', 0);
  redisClient.sadd('empty.set', '');  // since sets can't be empty need to add an empty string to them, see NOTE in redis-template, or at the bottom of this file
}

// callback should accept a single argument, the new id
this.getNewUserId = function(callback) {
    redisClient.incr('next.user.id', function(err,newid) {
         callback(err, newid);
    });
}


this.isNameTaken = function (name, roomName, callback) {
    // check room to see if the given name is taken
    redisClient.sismember('room:'+roomName+'client.names',name, 
      function(err,reply) {
          callback(err, reply);
    });
}

// if client name is already taken in the room, then we add digits to it to 
// make it unique
// if roomName == null, then we ignore that check entirely
// return the client name that we ended up setting (can be different from what was
//  requested if the name was taken)
this.setClientName = function(clientId, roomName, newName, callback) {
    console.log('\n************ changing client name. trying to use ' + newName);
    // Get old client name
    redisClient.get('client:'+clientId+':name', 
      function(err, oldName) {
        if (roomName != null) {
           var roomClientsSet = 'room:'+roomName+':client.names';
           // Remove old client name from room.clientnames and client (if they exist)
           redisClient.srem(roomClientsSet, oldName, function(err,res){})

           function ensureUniqueName(name) {
               // Set clientname in the room if it doesn't exist
               // if it does exist, modify the name w/ numbers and then try again
               redisClient.sadd(roomClientsSet, name, function(err,reply){
                  // reply is the # of elements added to the set. is 0 if the name was already in there
                   console.log('\n\n********** roomclients reply:' + reply);
	           if(reply == 1) { 
                       // Set new name for client
                      redisClient.set('client:'+clientId+':name', name, function(err,res) {
                         callback(err, name);
                      });
                   }
                   else {
                       setTimeout(ensureUniqueName(namer.numberIt(name)), 0);  // do it this way to prevent real recursion from happening
                   }
               });
           }

           ensureUniqueName(newName);
        }
        else {  // client has no current room so can set name safely
           redisClient.set('client:'+clientId+':name', newName, function(err,res) {
                 callback(err, newName);
           });
        }

      });
}


this.getClientName = function(clientId, callback) {
    // return the client's name
    redisClient.get('client:'+clientId+':name',
      function(err, name) {
          callback(err, name);
      }
    );

}

this.getClientRoom = function(clientId, callback) {
    // return the name of the room that the client is in
    redisClient.get('client:'+clientId+':room.name', 
      function(err,roomName) {
          console.log('\n\n*********** client room:' + clientId + ' ' + roomName);
          callback(err, roomName);
      });
}


this.getSongObjsFromIds = function(songIdArray, callback) {
  // takes an array of song ids and returns an array of
  // songIds / songObjs with attributes
  var functions = [];
  for(var idx=0; idx < songIdArray.length; idx++){
      functions.push([redisClient.get, ['song:'+songIdArray[idx]+':spotify.obj']]); //functions[idx] = [redisClient.get, ['song:'+songIdArray[idx]+':spotify.obj']];
      console.log('\n\n********** top songs converting list: ' + functions[idx]);
  }

  function returnFn() {
      // function called when all the song ids have been turned into spotify objects
          var songIdObjArray = [];
          for(var i=0; i< arguments.length; i++) {
             console.log('\n\n********** top songs results:' + arguments[i] + ' ' + i + ' of ' + arguments.length);
             songIdObjArray[i] = new Object();
             songIdObjArray[i].songObj = arguments[i];
             songIdObjArray[i].songId = songIdArray[i];
          }
          callback(null,songIdObjArray);
   }
 
  functions.push(returnFn);//[idx] = returnFn;
       
  self.waitOn.apply(self,functions);
}
// Next three functions return songObj, songIds by returning arrays of objects with
// .songId and .songObj attributes
this.getRoomNextSongs = function(roomName, callback) {
    // get the songs from the next up queue 
    redisClient.zrevrange('room:'+roomName+':next.songs', 0,-1,
      function(err, nextSongs) {
          if (nextSongs == '') { callback(err,[]);}
          else{
            self.getSongObjsFromIds(nextSongs, callback);
          }
      });
}

this.getRoomCurSong = function(roomName, callback) {
    redisClient.get('room:'+roomName+':cur.song',
      function(err, curSong) {
          if (curSong == '') { callback(err,[]);}
          else{
            console.log('\n\n******** room cur song' + curSong);
            self.getSongObjsFromIds([curSong], callback);
          }
      });
}

this.getRoomCurStart = function(roomName, callback) {
    redisClient.get('room:'+roomName+':song.start',
      function(err, songStart) {
          callback(err,songStart);
      });
}

this.getRoomPrevSongs = function(roomName, callback) {
    redisClient.lrange('room:'+roomName+':prev.songs',0,-1,
      function(err, prevSongs) {
          if (prevSongs == '') { callback(err,[]);}
          else{
            self.getSongObjsFromIds(prevSongs, callback);
          }
      });
}



this.doesRoomExist = function(roomName, callback) {
    // return true if the room already exists
    redisClient.exists('room:'+roomName+':client.ids', function(err,roomExists) {
      callback(err,roomExists);
   });
}


this.getClientsInRoom = function(roomName, callback) {
  // should return a list of client ids and names, but for now
  // just returns the client ids
  self.getSet('room:'+roomName+':client.ids', function(err,clients) {
     console.log('\n\n*********** CLIENTS IN ROOM : ' + clients);
     callback(err,clients);
  });
}

// Takes a song object, converts it to a string and adds it
// to the database.  Returns the id of the song
this.addSong = function(songObj, callback) {
    // Get a new id for the song and set it
    self.getNewSongId(function(err,id) {
      console.log('\n\n************* newSongId: '+id);
      // Convert object to a string
      var songStr = JSON.stringify(songObj);
      // Add spotifyObject, votes and vote.total to the database as one unit
      redisClient.multi()
        .set('song:'+id+':spotify.obj', songStr)
        .sadd('song:'+id+':votes', '')
        .set('song:'+id+':vote.total', 0)
        .exec(function(err, replies) {
            callback(err,id);
        });
    });
}

this.addSongToRoom = function(songId, roomName, callback) {
    // add song to the room's next.songs sorted set with a value of 0
    redisClient.zadd('room:'+roomName+':next.songs', 0, songId, function(err,res) {
       redisClient.zrevrange('room:'+roomName+':next.songs', 0,-1, function(err,res) {
            console.log('\n********** nextsongs after addSongToRoom' + res);});

       callback(err,null);
    });
}

this.getNewSongId = function(callback) {
    redisClient.incr('next.song.id', function(err,newid) {
       if(!err) { 
           callback(err,newid);
       }
    });   
}

this.getNewVoteId = function(callback) {
    // returns a new vote Id which can be used
    redisClient.incr('next.vote.id', function(err,newid) {
         console.log('\n\n************* getNewVoteId' + newid);
         callback(err,newid);
    });   
}


this.getTopSongs = function(roomName, numSongs, callback) {
    // Get the top numSongs number of song objs from the room's next queue
    // and return it.  Returns actual song objects b/c all we need for top songs are the song name/song artists
    console.log('\n\n*********** TOP SONGS ROOM: '+roomName);
    redisClient.zrevrange('room:'+roomName+':next.songs', 0,numSongs-1, function(err,results) {
       console.log('\n\n******** TOP SONG RESULTS: ' + err + ' ' + ' ' + results);
       // have to convert song ids into spotify objects
       // do this by calling waitOn with a whole bunch of gets
       var functions = [];
       for(var idx=0; idx < results.length; idx++){
         functions.push([redisClient.get, ['song:'+results[idx]+':spotify.obj']]); //functions[idx] = [redisClient.get, ['song:'+results[idx]+':spotify.obj']];
         console.log('\n\n********** top songs converting list: ' + functions[idx]);
       }

       // redisClient.get('song:'+results[0]+':spotify.obj', function(err, res) { console.log('\n\n******* song id '+results[0]+' spotify obj ' + res);});

       function returnFn(foo,bar) {
          console.log('\n\n*********** foo: ' + foo);
          console.log('\n\n*********** bar: ' + bar);
          // function called when all the song ids have been turned into spotify objects
          var topSongs = [];
          for(var i=0; i< arguments.length; i++) {
             console.log('\n\n********** top songs results:' + arguments[i] + ' ' + i + ' of ' + arguments.length);
             topSongs[i] = arguments[i];
          }
          callback(err,topSongs);
       }

       functions.push(returnFn);//[idx] = returnFn;
       
       self.waitOn.apply(self,functions);
    });
}


this.getClientVotes = function(clientId, callback) {
   self.getSet('client:'+clientId+':votes', function(err,members) {
       callback(err,members);
   });
}

this.removeVote = function(voteId, callback) {
   redisClient.get('vote:'+voteId+':song.id', function(err, songId) {
      console.log('\n******** REMOVE VOTE ' + voteId + 'FROM ' + songId);
      // set the song's vote total and update the vote
      self.updateVote(songId, voteId, 0, function(err) {
         // remove vote from the song's set of votes
         redisClient.srem('song:'+songId+':votes', voteId, function(err, res) {

           // don't remove from client or db since we may do this only when
           // a client has switched rooms, so we can reuse the vote maybe?
           callback(err,true);
         });
      });
    });
}

this.addRoom = function(roomName, callback) {
    // add a new room with a given roomName to the server
    // be sure to use SETNX for this stuff to avoid race condition
    redisClient.multi()
       .sadd('room:'+roomName+':client.ids', '')
       .sadd('room:'+roomName+':client.names','')
       .setnx('room:'+roomName+':cur.song', '')
       .exec(function(err,replies) {
         // no return 
         callback();
       });
}

// no return
this.addClientToRoom = function(clientId, roomName, callback) {

    function add(addRoomResult) {
       // set client's room id and add client's id to room
       console.log('\n\n************ addClientToRoom');
       self.waitOn([redisClient.set, ['client:'+clientId+':room.name', roomName]],[redisClient.sadd, ['room:'+roomName+':client.ids', clientId]], callback);
    }

    // see if room exists, if not create it.
    redisClient.exists('room:'+roomName+':client.ids', function(err, exists) {
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

this.removeClientFromRoom = function(clientId, roomName, callback) {
    // remove roomName from client's room id
    // remove clientname and client id from room
    console.log('\n\n*********** removing client from room');
    self.getClientName(clientId, function(err,name) {
       self.waitOn([redisClient.srem,['room:'+roomName+':client.ids', clientId]],
              [redisClient.srem,['room:'+roomName+':client.names', name]],
              [redisClient.set,['client:'+clientId+':room.name', '']],
             function() {
               callback(err,true);
            });
    });

}

this.getVoteId = function(clientId, songId, callback) {
    // return the id of the vote associated with this client and song
    // get it by intersecting the client's vote list and song's vote list
    redisClient.sinter('song:'+songId+':votes', 'client:'+clientId+':votes', function (err, res) {
      console.log('\n\n************* results from getVote! "' + res+'"');
      if (res[0] == null){        // res is some object no matter what apparently. i.e. if the vote wasn't found, (res == null) -> false
         console.log('\n\n************* vote not found! ');
        // return a new id if the vote is not found
         self.getNewVoteId(function(err,newid) {
             console.log('\n\n************* new vote id!' + newid);
             // Add the new song id to the client's and song's vote set
             self.waitOn([redisClient.sadd, ['song:'+songId+':votes', newid]],
                         [redisClient.sadd, ['client:'+clientId+':votes', newid]],
                         [self.getClientRoom, [clientId]],
                         function(add1,add2, roomName) { 
                         // also need to initialize the vote object
                           self.waitOn([redisClient.set, ['vote:'+newid+':song.id', songId]],
                                       [redisClient.set, ['vote:'+newid+':value', 0]],
                                       [redisClient.set, ['vote:'+newid+':room.name', roomName]],
                           function() {
                              callback(err,newid);
                           });
                         });
         });
      }
      else {
        console.log('\n\n************* vote found! ' + res[0] + ' ' + typeof(res[0]));
        callback(err,res[0]);
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
            .set('vote:'+voteId+':value',newValue)
            .exec(function(err, replies) { 
              var voteTotal = replies[0];
              var voteCount = replies[1] - 1 ;  // sub 1 for the empty string
              var roomName = replies[2];
              // set value of song in sorted set  
             console.log('\n******** UPDATE VOTE ROOM NAME ' + roomName);
             // Only update the vote total if the song is in fact a next song!
             //  this should be insured on the client side by not having any of the vote
             //  bars displayed if the song isn't an upcoming song, but just in case we have a test
             //  for it here too.
             redisClient.zscore('room:'+roomName + ':next.songs', songId, function(err, songExists) {
               console.log('\n\n******** zscore is null ' + (songExists == null) + ' is empty ' + (songExists == '') + ' actually is "'+songExists+'"');
               // zscore returns nil if the member isn't found
               if (songExists != null) {
               redisClient.zadd('room:'+roomName+':next.songs', voteTotal, songId, function(err,res) {
                   redisClient.zrevrange('room:'+roomName+':next.songs', 0,-1, function(err2,res2) {
                      if(err || err2) { console.log('\n\n************* ERROR ERROR ERROR in update Vote ****************');}
                      console.log('\n********** nextsongs after update vote ' + res2);
                      console.log('\n********** NEW VOTE TOTAL ' + voteTotal+'\n******'+songId);
                   })
                  // returns the new score of the song / number of clients
                 callback(err,voteTotal / voteCount);
               });
              }
              else {
                   // song not found in next.songs so we ignore the vote
                   // potentially this section could be reworked so that a song as a status or something
                   //   so we know where to look
                   callback(err, 0);
              }
             }); // end zscore callback
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
           callback(err,[]);
       }
       else {
          callback(err,mems);
       }
   });
}

this.getSetSize = function(setKey, callback) {
   redisClient.sdiff(setKey,'empty.set', function(err, res) {
       console.log('\n********** setSize diff: ' + res);
       if(res == null) {
       console.log('\n********** setSize diff is null ');
         callback(err,0);
       }
       else {
       console.log('\n********** setSize diff is  '+res.length + ' long');
         callback(err,res.length);
       }
   });

}

this.changeSongs = function(roomName, callback) {
   // Get first thing from next songs,
   redisClient.zrange('room:'+roomName+':next.songs', -1, -1, function(err, highestSongId) {
     console.log('\n********* next songs: "'+highestSongId+'" is null: ' + (highestSongId == null) + ' is empty str : ' + (highestSongId == ''));
     if (highestSongId != '') {
       redisClient.get('song:'+highestSongId+':spotify.obj', function(err, highestSong) {
         redisClient.get('room:'+roomName+':cur.song', function(err, cursong) {
           if(cursong != '') {      // Push cursong onto prev songs and LTRIM that list
                redisClient.lpush('room:'+roomName+':prev.songs', cursong, function(err, res) {
                  redisClient.ltrim('room:'+roomName+':prev.songs', 0,2);
               });
            }
            
            // set current song in the room
            // remove song from the next songs list
           self.waitOn([redisClient.set, ['room:'+roomName+':song.start', (new Date()).getTime()]],
                        [redisClient.set, ['room:'+roomName+':cur.song', highestSongId]],
                        [redisClient.zrem, ['room:' + roomName+':next.songs', highestSongId]],
                        function() {
      console.log('\n*********** REMOVING: ' + highestSongId);
      redisClient.zrange('room:'+roomName+':next.songs', 0, -1, function(err, foobar) {
                console.log('\n********* AFTER REMOVING next songs are: ' + foobar);
                          
                          // return the stringified version of the JSON object
                         callback(err,highestSongId,highestSong);       
              });              
            });
         });     
      });
     }
     else { // no next song, still need to get rid of cur song!!!
         redisClient.set('room:' + roomName + ':cur.song', '', function(err) {
           callback(err,null,null);
             });
     }

   });
}

// this function takes any number of arguments arg1, arg2,..., argN, but expects:
// argN is a callback function to be called when all redis calls have returned
// arg1...argN-1 look like [redisFnToCall, redisArgs] note that redisArgs must be an array
//   so that we can push the appropriate callback into it
// when they've completed, callback will be called with the return values in order
//   eg: redisClient.waitOn([redisClient.getClientName, [3]], [redisClient.getNewSongId, []], returnFn)
//       returnFn will be called as: returnFn(song3sAvg, newSongId);
// should be used anytime there are multiple calls that are needed, but don't rely on each
// other.  not necessarily just getter functions 
//
// CURRENTLY HAVE AN ISSUE IF THE FUNCTION NEEDS TO USE 'this'
//  To make this stuff work with the redis calls I always set the 'this'
//  value to be redisClient, however this could break other fns.
//  not sure how to use apply and *not* overwrite the 'this'
//
// Note also that this expects that the redisFnToCall should return 2 values:
//    err, actualReturnValue
// This that is what calls to redisCleint do, and so everything should be consistent
this.waitOn = function() {
  console.log('\n\n*********** waitOn called');
  var retVals = [];  // values returned from other redis calls
  var fnToIndex = {};    // maps the function called to the index it should have in retVals
  var returnFn = arguments[arguments.length-1];   // last argument is the fn to call when the waits are all done
  var valuesReturned = 0;       // keeps track of how many calls have been completed

  function complete() {
      // console.log('\n\n*********** waitOn values returned: '+ valuesReturned + ' need: ' +retVals.length);
      // console.log('\n\n*********** waitOn values: ' + retVals);
      if(valuesReturned == retVals.length) {
        returnFn.apply(this, retVals);
      }
  }

   // I think the way this closure works is that i is what we want here.  I tested it out in a separate file at least.
   function makeCallback(index) {
     return function(err,redisVal) { // console.log('\n\n*********** callback index value ' + index); 
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
     // console.log('\n\n************ redisFn ' + redisFn);
     // console.log('\n\n************ args: ' + redisFnArgs);
     redisFn.apply(redisClient, redisFnArgs);   // call the redis function with the correct arguments including callback.  don't want to overwrite the this value of the function
  }
}

module.exports = this;
