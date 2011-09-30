// This is a test program to prove a point.
// This will crash if setName = 'empty.string.set' but works with anything else
//  include 'empty.string.set2'

var redis = require('redis');
var redisClient = redis.createClient();

var setName = 'empty.string.set';  

redisClient.sadd('foo', 1);
redisClient.sadd('foo', '');
redisClient.sadd(setName, '', function(err, val) { console.log('err:'+err+' val: '+val);});  

redisClient.sdiff('foo', setName, function(err, val) {
        console.log('');
    });
