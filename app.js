
/**
 * Module dependencies.
 */

var express = require('express');
var app = express.createServer();
var io = require('socket.io').listen(app);

// Configuration

app.configure(function(){
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
    app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
    app.use(express.errorHandler()); 
});


// Routes
var numUsers = 0;
app.get('/', function(req, res){
    res.render('index', {
        title: 'sup son',
         actives: ++numUsers
    });
});

app.get('/:room', function(req, res){
  res.render('room', {
    room: req.params.room,
    actives: 924
  });

});

// Socket.io Server stuff
var curQ = [];
var spotify = require('./spotApi.js');
var votes = {'good' : 0, 'neutral' : 0, 'bad' : 0};


io.sockets.on('connection', function(socket){
    console.log("new client connected");

    var clients = [];        // keeps track of info for different conneted users
    clients[socket] = {vote : 'neutral'};
    votes['neutral'] += 1;
    votes['prevVote'] = '';
    votes['curVote'] = 'neutral';

    // send current queue to client
    curQ.forEach(function(item){
        console.log(item);
        socket.emit('songForList', item);
    });

    socket.on('queueUp', function(song){
        // if song is valid, get info
        spotify.apiLookup(song, function(songInfo){
            curQ.push(songInfo);
            io.sockets.emit('songForList', songInfo);
            console.log("curQ is: " + curQ);
        });
    });

    socket.on('startPlayback', function(client){
        if(curTimeout != null){
            clearTimeout(curTimeout);
        }
        playNextSong();
    });

    socket.on('vote', function(vote) {
	var prev = clients[socket].vote;
	console.log(votes[prev]);
	votes[prev] -= 1;
	votes[vote] += 1;
	clients[socket].vote = vote;
        console.log(votes);
	votes['prevVote'] = prev;
	votes['curVote'] = vote;
        votes['changed'] = true;
        socket.emit('votes', votes);
        votes['changed']= false;
	io.sockets.emit('votes', votes);
    });

    votes['changed'] = false;
    io.sockets.emit('votes', votes);
});

io.sockets.on('disconnect', function(socket) {
    votes[clients[socket].vote] -= 1;
    votes['prevVote'] = '';
    votes['curVote'] = '';
    io.sockets.emit('votes',votes);
});


// song starting function
var curTimeout = null;
function playNextSong(){
    if(curQ.length > 0){    
        var songInfoRaw = curQ.shift();
        var songInfo = JSON.parse(songInfoRaw);
        votes['good'] = 0;
        votes['neutral'] = 0;
        votes['bad'] = 0;
        io.sockets.emit('changeSong', songInfo.track.href);
        io.sockets.emit('votes', votes);
        curTimeout = setTimeout(function(){
            playNextSong();
        }, songInfo.track.length*1000);
    }
}

var port = process.env.PORT || 3000;
app.listen(port);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
