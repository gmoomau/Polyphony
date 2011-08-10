
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


// Socket.io Server stuff
var curQ = [];
var spotify = require('./spotApi.js');

io.sockets.on('connection', function(socket){
    console.log("new client connected");

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
});

// song starting function
var curTimeout = null;
function playNextSong(){
    if(curQ.length > 0){    
        var songInfoRaw = curQ.shift();
        var songInfo = JSON.parse(songInfoRaw);
        io.sockets.emit('changeSong', songInfo.track.href);
        curTimeout = setTimeout(function(){
            playNextSong();
        }, songInfo.track.length*1000);
    }
}

require("./test.js");

app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
