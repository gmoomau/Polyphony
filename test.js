// This is a test program to prove a point.
// This will crash if setName = 'empty.string.set' but works with anything else
//  include 'empty.string.set2'

var redis = require('redis');
var redisClient = redis.createClient();

var setName = 'empty.string.set2';  
redisClient.flushall();

redisClient.sadd('foo', 1);
redisClient.sadd('foo', '');
redisClient.sadd(setName, '', function(err, val) { console.log('err:'+err+' val: '+val);});  

redisClient.sdiff('foo', setName, function(err, val) {
        console.log('');
    });

redisClient.zrange('bar',0,4, function(err, res) {
        console.log(res);
    });

redisClient.zadd('bar',1, 'aoweinfoweif');
redisClient.zadd('bar',5, 'asdfasf');
redisClient.zrevrange('bar',0,4, function(err, res) {
        console.log(res);
        redisClient.zadd('bar',19, 'aoweinfoweif', function(err, res2) {
                redisClient.zrevrange('bar',0,4,function(err,res3) {
                        console.log(res3);
                    });
            });
});

