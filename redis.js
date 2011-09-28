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
    redisClient.incr('next.user.id', function(err,newid) {
       if(!err) { return newid;}
    });
}

module.exports = this;