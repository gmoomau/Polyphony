function initVotes(socket) {
  socket.on('vote update', function(songId, score) {
    // update vote stuff here
    $("#"+songId+"_songDiv").data("score", score);
  });

// add listener for upcoming songs if i don't
// want to do client-side sorting
}
