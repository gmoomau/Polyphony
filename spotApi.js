// get track info from spotify
// http://developer.spotify.com/en/metadata-api/lookup/track/


var httpReg = /http:\/\/open\.spotify\.com\/track\/(.*)/;
var spotReg = /spotify:track:(.*)/;
var uriLookup = require('http').createClient(80, 'ws.spotify.com');


this.apiLookup = function(uri, cb){
    var match = httpReg.exec(uri);
    if(match){
        uri = "spotify:track:" + match[1];
    }
    match = spotReg.exec(uri);
    if(match){
        // get info from spotify
        var uriInfoRaw = "";
        var reqUrl = "/lookup/1/.json?uri="+match[0];
        var spotReq = uriLookup.request("GET", reqUrl.toString("utf8"),
                {'host': 'ws.spotify.com'});
        spotReq.end();
        spotReq.on('response', function(response){
          if(response.statusCode == 200){
            console.log('STATUS: ' + response.statusCode);
            response.setEncoding('utf8');
            response.on('data', function(chunk){
              uriInfoRaw += chunk;
            });
            response.on('end', function(){
              cb(uriInfoRaw);
            });
          }
        });
    }
    else{
//        return null;
        console.log("invalid uri: " + uri);
    }

}

module.exports = this;



