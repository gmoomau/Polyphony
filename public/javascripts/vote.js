function setVote () {
  var songId = parseInt(this.id);
  var voteValue = $("#"+songId+"_voteInner").width();
  $("#"+songId+"_voteValue").val(voteValue);
  $("#"+songId+"_voteSet").show();
  setTimeout(function() { $("#"+songId+"_voteSet").hide();}, 1500);
  socket.emit('vote', songId, voteValue);
}

function initVotes(socket) {
  socket.on('vote update', function(songId, avg) {
    // update vote stuff here
  });

  socket.on('vote topsongs', function(songs) {
    // create html for top songs list
    $("#topSongList").text('');
    var newSongList = '<ol>';
    for(var i=0; i<songs.length; i++){
      newSongList += '<li class="topSong">'+getSongName(songs[i])+'</li>';
    }
    $("#topSongList").html(newSongList);
  });
}
