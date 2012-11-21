function initVotes(socket) {
  socket.on('vote update', function(songId, score) {
    // update vote stuff here
    //$("#"+songId+"_songDiv").data("score", score);

    var changedSong = $("#"+songId+"_songDiv");
    changedSong.data("score", score);
    insertSong(changedSong, songId, score);
  });
}