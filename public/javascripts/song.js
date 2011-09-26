// This file has all of the javascript functionality including control of sockets for dealing with changing/setting songs.


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
              results = jQuery.parseJSON(rawData);
              found = {};
              displaySearchResults(0);
            },
          'text');
        }
      }  // end if songName > 0
      else {
        $("#results").text('');
      }
}

  // Displays results starting at a given value
  function displaySearchResults(startAt) {
    var count = 0;  // how many things we've added
    var lastChecked = 0; // last result looked at
    //$("#results").text('');         
    var addHtml = '';
    for(var i=startAt;count < 5 && i<results.tracks.length; i++) {
      var track = results.tracks[i];
      var regionClass = 'available';

      if (!isSongAvailable(track, 'US')){
        regionClass = 'unavailable';
      }

      var artist = getSongArtist(track);
      var song = getSongName(track);
      if (!found[artist+song]) {
        var toAdd = artist + ' - '+song;
        addHtml += '<p class="'+regionClass+'" onClick="queueSong('+"'"+getSongLink(track)+"'"+')">'+toAdd+'</p>';
        count++;
        found[artist+song] = true;
      }
      lastChecked = i;
    }

    startAt += 5;
    if(lastChecked < results.tracks.length - 1){
      addHtml += '<p onClick="displaySearchResults('+startAt+')">More</p>';
    } 
    
    if(results.tracks.length == 0){
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

socket.on('song add', function(songInfo){
      var trackStatus = 'comingUp';
      if (songInfo.status == 'prev') {
         trackStatus = 'alreadyPlayed';
      }
      else if (songInfo.status == 'cur') {
         trackStatus = 'currentlyPlaying';
      }
      var songArtist = getSongArtist(songInfo);
      var songName = getSongName(songInfo);

      var trackStr = "<div class='"+trackStatus+"'>"+songArtist +" - "+ songName;
      trackStr += "<div class='voteOuter' id='"+songInfo.id+"_voteOuter'>";
      trackStr += "<input id='"+songInfo.id+"_voteValue' type='hidden' value='50' />";
      trackStr += "<div class='voteInner' id='"+songInfo.id+"_voteInner'>&nbsp;</div></div>"; // also closes the voteOuter
      trackStr += "<span id='"+songInfo.id+"_voteSet'>Set!</span>"; 
      trackStr += "<div class='voteOuter'>"; // doesn't need an id
      trackStr += "<div class='voteAvg' id='"+songInfo.id+"_voteAvg'>&nbsp;<div> </div></div>";  // also closes the voteOuter
      trackStr += "</div></div><p />";  // also closes the track div and voteOuter

      $(trackStr).hide().appendTo("#queue").slideDown('slow');
      $("#"+songInfo.id+"_voteSet").hide();
      $("#"+songInfo.id+"_voteOuter").mousemove(slideVote);
      $("#"+songInfo.id+"_voteOuter").mouseleave(setVoteWidth);
      $("#"+songInfo.id+"_voteOuter").click(setVote);
      $("#"+songInfo.id+"_voteOuter").click();
      setColorAndWidth(songInfo.id, 50, false);
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