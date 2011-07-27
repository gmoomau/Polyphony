
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
var httpReg = /http:\/\/open\.spotify\.com\/track\/(.*)/;
var spotReg = /spotify:track:(.*)/;
var uriLookup = require('http').createClient(80, 'ws.spotify.com');

io.sockets.on('connection', function(socket){
    console.log("new client connected");

    // send current queue to client
    curQ.forEach(function(item){
        console.log(item);
        socket.emit('songForList', item);
    });

    socket.on('queueUp', function(song){
        // get track info from spotify
        // http://developer.spotify.com/en/metadata-api/lookup/track/

        // validate uri
        var match = httpReg.exec(song);
        if(match){
            song = "spotify:track:" + match[1];
        }
        match = spotReg.exec(song);
        if(match){
            // get info from spotify
            var songInfoRaw = "";
            var reqUrl = "/lookup/1/.json?uri="+match[0];
            var spotReq = uriLookup.request("GET", reqUrl.toString("utf8"),
                {'host': 'ws.spotify.com'});
            spotReq.end();
            spotReq.on('response', function(response){
                console.log('STATUS: ' + response.statusCode);
                response.setEncoding('utf8');
                response.on('data', function(chunk){
                    songInfoRaw += chunk;
                });
                response.on('end', function(){
                    // add track to queue
                    curQ.push(songInfoRaw);
                    io.sockets.emit('songForList', songInfoRaw);
                });
            });
        }
        else{
            console.log("invalid uri " + song);
        }
        
    });

    socket.on('startPlayback', function(client){
        if(curTimeout){
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


app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
