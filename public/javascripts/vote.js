function initVotes(socket) {
  socket.on('vote update', function(songId, score) {
    // update vote stuff here
    //$("#"+songId+"_songDiv").data("score", score);

    var changedSong = $("#"+songId+"_songDiv");
    var songList = $(".song");
    var oldIndex = songList.index(changedSong);
    var newIndex = 0;
    changedSong.data("score", score);

    //tmp
    var found = false; // true if the new position for the song has been found
    songList.each(function(index, item){
      // iterate through list until reaching a song with a lower score
      // or higher id
      if(oldIndex != index){
        // don't compare to self
        var thisScore = $(item).data("score");
        if(score > thisScore){
          // our song has a higher score than anything else in the list
          found = true;
          return false;
        }
        else if(score == thisScore){
          var thisId = $(item).data("id");
          if(songId < thisId){
            // our song has a lower id than any other song with this score
            found = true;
            return false;
          }
        }
      }

      newIndex++;
    });

    console.log(newIndex);

    if(oldIndex + 1 != newIndex){
      // only animate if the song is actually moving
      
      if(found){
        changedSong.slideUp('slow', function(){
          changedSong.insertBefore(songList[newIndex]).slideDown('slow');
        });
      }
      else {
        // song must be moved to end of queue
        changedSong.slideUp('slow', function(){
          changedSong.appendTo($("#queue")).slideDown('slow');
        });
      }
    } 
  });

  // add listener for upcoming songs if i don't
  // want to do client-side sorting
}