var redisClient = require('redis').createClient();

// initializes stuff for our redis connection.
// for now sets all of the necessary next ids to be 0
// but in the future this might not be necessary once the 
// redis db has been created/used
this.initRedis = function() {
  redisClient.set('next.user.id', '0');
  redisClient.set('next.vote.id', '0');
  redisClient.set('next.queue.id', '0');
  redisClient.set('next.song.id', '0');
}

this.getNewUserId = function() {
    // returns a new user id, could be generalized to getNewId and take a
    // string argument which would be 'user', 'vote', 'queue' or 'song'
    // but that might hurt readability and flexibility if we don't want
    // all ids to function the same way 
    redisClient.incr('next.user.id', function(err,newid) {
       if(!err) { 
         return newid;
       }
    });
}


this.isNameTaken = function (name, room) {
    // check room to see if the given name is taken
    return false;
}

this.setUserName = function(userId, roomName, newName) {
    // Remove old user name from room.usernames and user (if they exist)
    // Set new name for user and room.usernames
    // return the old user name
    return 'bar';
}

this.getUserName = function(userId) {
    // return the user's name
    return 'foo';
}

this.getUserRoom = function(userId) {
    // return the name of the room that the user is in
    return 'room';
}

this.getRoomNextSongs = function(roomName) {
    // get the songs from the next up queue 
    return [];
}

this.getRoomCurSong = function(roomName) {
    return '';
}

this.getRoomPrevSongs = function(roomName) {
    return [];
}


this.removeVote = function(voteId) {
    // get the vote's value and vote's songId
    // subtract value from the song's vote.total
    // remove vote from the song's set of votes
    // remove vote from the db
}


this.doesRoomExist = function(roomName) {
    // return true if the room already exists
    return true;
}

this.addRoom = function(roomName) {
    // add a new room with a given roomName to the server
    // be sure to use SETNX for this stuff to avoid race condition
    // when two users try to add a room at the same time
    // return false if room already exists. o/w return true
}

this.getCurrentSong = function(roomName) {
    // returns the room's currently playing song or an empty string
    // if no song is playing
    return '';
}

this.addUserToRoom = function(userId, roomName) {
    // set user's room id
    // add user's id and user's name to the room
}

this.removeUserFromRoom = function(userId, roomName) {
    // remove roomName from user's room id
    // remove username and user id from room
}

this.getUsersInRoom = function(roomName) {
    // returns a list of user id/names
    return [];
}


// Takes a song object, converts it to a string and adds it
// to the database.  Returns the id of the song
this.addSong = function(songObj) {
    // Get a new id for the song and set it
    // Convert object to a string
    // Add spotifyObject, votes and vote.total to the database
    return 1;
}

this.addSongToRoom = function(songId, roomName) {
    // add song to the room's next.songs sorted set
}

this.getNewSongId = function() {
    redisClient.incr('next.user.id', function(err,newid) {
       if(!err) { 
         return newid;
       }
    });   
}

this.getNewVoteId = function() {
    // returns a new vote Id which can be used
    return 1;
}

this.getVoteId = function(userId, songId) {
    // return the id of the vote associated with this user and song
    // get it by intersecting the user's vote list and song's vote list
    // return a new id if the vote is not found
    return 1;
}

this.updateVote = function(songId, voteId, newValue) {
    // get the old vote value, and subtract it from the song's vote total
    // updates a votes value, and add newValue to the song's vote total
    // set value of song in sorted set 
    // returns the new score of the song / number of users by calling getSongAvg
    return 75;
}

this.getSongAvg = function(songId) {
    // compute the song's new score 
    // return the song's new voter average
    return 75;
}

this.getTopSongs = function(roomName, numSongs) {
    // Get the top numSongs number of song objs from the room's next queue
    // and return it
    return [];
}

module.exports = this;