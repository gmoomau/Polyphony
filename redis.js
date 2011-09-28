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
    // but that might hurt readability
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

this.doesRoomExist = function(roomName) {
    // return true if the room already exists
    return true;
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

module.exports = this;