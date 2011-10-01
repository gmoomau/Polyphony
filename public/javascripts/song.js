// This file has all of the javascript functionality including control of sockets for dealing with changing/setting songs.


var searchResults = [];  // an array storing all search results

function queueSong(text) {
    $("#uri").val(text);
    $("#uri").click();
}

function searchForSongs(){
      var songName = $("#songSearch").val();
      if (songName.length > 0) {
        if (songName != prevSearch) {
          prevSearch = songName;
          $.get("http://ws.spotify.com/search/1/track.json?q="+songName, {}, 
            function(rawData) {
              processResults(jQuery.parseJSON(rawData));
              displaySearchResults(0);
            },
          'text');
        }
      }  // end if songName > 0
      else {
        $("#results").text('');
      }
}

// is given the search results from the spotify api and sets the global searchResults
// 0,1,2... of song results
function processResults (spotifyResults) {
    searchResults = [];   // actually stores the song objects.  only has unique results. is indexed 0,1,2...
                        // the found hash maps from songNames to an index to this array
    var found = {}

    for (var res in spotifyResults.tracks) {
        var songResult = spotifyResults.tracks[res];
	var songName = getSongName(songResult);
        var songArtist = getSongArtist(songResult);
        var songString = songName + songArtist;
        if (songString in found) {
            // see if availability is now true
            if (isSongAvailable(songResult,'US')) {
                // since it is, we want to update the result to reflect this change
		addSongAvailable(searchResults[found[songString]], 'US');
                setSongLink(searchResults[found[songString]], getSongLink(songResult));
            }
        }        
        else {
            // add to the found list
            found[songString] = searchResults.length;
            searchResults.push(songResult);
        }
    }  
}

  // Displays results starting at a given value
  function displaySearchResults(startAt) {
    var count = 0;  // how many things we've added
    var lastChecked = 0; // last result looked at

    var addHtml = '';

    for(var i=startAt;count < 5 && i<searchResults.length; i++) {
      var track = searchResults[i];
      var regionClass = 'available';

      if (!isSongAvailable(track, 'US')){
        regionClass = 'unavailable';
      }

      var artist = getSongArtist(track);
      var song = getSongName(track);

      var toAdd = artist + ' - '+song;
      addHtml += '<p class="'+regionClass+'" onClick="queueSong('+"'"+getSongLink(track)+"'"+')">'+toAdd+'</p>';
        count++;

      lastChecked = i;
    }

    if(lastChecked >= 5) {
      var prevStart = startAt - 5;
      addHtml += '<span onClick="displaySearchResults('+prevStart+')">Prev &nbsp;</span>';
    } 
    else {
	addHtml += '<span> &nbsp; &nbsp; &nbsp; &nbsp;</span>';
    }

   startAt += 5;
 
    if(lastChecked < searchResults.length - 1){
      addHtml += '<span onClick="displaySearchResults('+startAt+')">Next</span>';
    } 
    
    if(searchResults.length == 0){
      addHtml = '<p><em>No tracks found.</em></p>';
    }

    if($("#results").html()=== ''){
      $(addHtml).hide().appendTo("#results").slideDown("slow");
    }
    else{
      $("#results").html(addHtml);
    }

  }

function initSongs(socket) {
// songStart is either 0, or the time when the song started playing in the room in millis
socket.on('song change', function(songURI, mins, secs){

      $("#loadSong").attr('src', songURI+'#'+mins+':'+secs);

      // bump previously played song up
      var prevSong = $(".currentlyPlaying");
      prevSong.removeClass("currentlyPlaying");
      prevSong.addClass("alreadyPlayed");
     
      // check to see if we have > 3 alreadyPlayed songs, if so get rid of one
      if($(".alreadyPlayed").size() > 3) {
	  $(".alreadyPlayed:first").remove();
      }

      // mark current song as playing
      var nowPlaying = $(".comingUp").filter(":first");
      nowPlaying.removeClass("comingUp");
      nowPlaying.addClass("currentlyPlaying");
});

socket.on('song add', function(songInfo, songId, songStatus){
      var trackStatus = 'comingUp';
      if (songStatus == 'prev') {
         trackStatus = 'alreadyPlayed';
      }
      else if (songStatus == 'cur') {
         trackStatus = 'currentlyPlaying';
      }
      var songArtist = getSongArtist(songInfo);
      var songName = getSongName(songInfo);

      var trackStr = "<div class='"+trackStatus+"'>"+songArtist +" - "+ songName +'</div>';
      trackStr += "<div class='voteOuter' id='"+songId+"_voteOuter'>";
      trackStr += "<input id='"+songId+"_voteValue' type='hidden' value='50' />";
      trackStr += "<div class='voteInner' id='"+songId+"_voteInner'>&nbsp; </div></div>"; // also closes the voteOuter

      trackStr += "<div class='voteOuterAvg'>"; // doesn't need an id
      trackStr += "<div class='voteInner' id='"+songId+"_voteAvg'>&nbsp;</div></div>";  // also closes the voteOuter
      trackStr += "<span class='voteSet' id='"+songId+"_voteSet'>Set!</span>"; 
      trackStr += "</div><p />";  // also closes the track div and voteOuter

      $(trackStr).hide().appendTo("#queue").slideDown('slow');
      $("#"+songId+"_voteSet").hide();
      $("#"+songId+"_voteOuter").mousemove(slideVote);
      $("#"+songId+"_voteOuter").mouseleave(setVoteWidth);
      $("#"+songId+"_voteOuter").click(setVote);
      $("#"+songId+"_voteOuter").click();
      setColorAndWidth(songId, 50, false);
    });

   $("#playItOff").click(function(e){
        e.preventDefault();
        socket.emit('song start');
   });

    var searchTimeout = null;
    $("#songSearch").keyup(function(e){
      if(searchTimeout != null){
        clearTimeout(searchTimeout);
      }
      if(e.which == 32 || e.which == 13){
        searchForSongs();
      }
      else{
        searchTimeout = setTimeout(searchForSongs, 500);
      }
    });

    $("#uri").click(function(e){
      e.preventDefault();
      var uriToAdd = $("#uri").val()
      socket.emit('song add',uriToAdd);
    });

    $("#songSearch").click(function(e) {
       $("#songSearch").val('');
    });

}