
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
app.get('/', function(req, res){
    res.render('index', {
        title: 'sup son',
         actives: 0
    });
});

app.get('/:room', function(req, res){
  res.render('room', {
    room: req.params.room,
    actives: 0
  });

});

// Socket.io Server stuff
var curQ = [];
var spotify = require('./spotApi.js');
var votes = {};

var users = {};

io.sockets.on('connection', function(socket){
    console.log("new client connected");

    var clients = [];        // keeps track of info for different conneted users
    clients[socket] = {vote : 'neutral'};

    // send current queue to client
    curQ.forEach(function(item){
        console.log(item);
        socket.emit('songForList', item);
    });

    socket.on('queueUp', function(song){
        // if song is valid, get info
        spotify.apiLookup(song, function(songInfo){
            curQ.push(songInfo);
            socket.get('room', function(err,room) {
                 io.sockets.in(room).emit('songForList', songInfo);
                 console.log("\n******curQ is: " + curQ);
            });
        });
    });

    socket.on('startPlayback', function(client){
        if(curTimeout != null){
            clearTimeout(curTimeout);
        }
        socket.get('room', function(err,room) {
          playNextSong(room);
	});
    });

    socket.on('vote', function(vote) {
	var prev = clients[socket].vote;
        if (prev != vote) {
            socket.get('room', function(err,room) {
               console.log(votes[room][prev]);
               votes[room][prev] -= 1;
               votes[room][vote] += 1;
               clients[socket].vote = vote;
               console.log(votes);
               io.sockets.in(room).emit('votes', votes[room]);
		});
        }
    });

    socket.on('disconnect', function() {
	votes[clients[socket].vote] -= 1;
        socket.get('room', function(err,room) {
          if(room != null && room in users) { 
               users[room]--;
               votes[room][clients[socket].vote]--;
               io.sockets.in(room).emit('votes', votes[room]);
               io.sockets.in(room).emit('users', users[room]);
          }
        });
    });

    socket.on('join room', function(room) {
        if (room in users){
          users[room]++;
          votes[room]['neutral']++;
        }
        else {
            users[room] = 1;
            votes[room] = {'good' : 0, 'neutral' : 1, 'bad' : 0};
        }
	console.log('JOINED '+room+' VOTES:'+votes[room]);
        socket.set('room', room);
	socket.join(room);

        io.sockets.in(room).emit('votes', votes[room]);
	io.sockets.in(room).emit('users', users[room]);
        
    });
 
});

// song starting function
var curTimeout = null;
function playNextSong(room){
    if(curQ.length > 0){    
        var songInfoRaw = curQ.shift();
        var songInfo = JSON.parse(songInfoRaw);


	io.sockets.in(room).emit('changeSong', songInfo.track.href);
	votes[room]['good'] = 0;
	votes[room]['neutral'] = users[room];
	votes[room]['bad'] = 0;

        io.sockets.in(room).emit('votes', votes[room]);

        curTimeout = setTimeout(function(){
            playNextSong(room);
        }, songInfo.track.length*1000);
    }
}

var port = process.env.PORT || 3000;
app.listen(port);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
