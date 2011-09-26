
    function slideVote (e) {
         var songId = parseInt(this.id);
         var width = $(this).width();
         var location = (e.pageX - $("#"+songId+"_voteInner").offset().left) / width;
         location = location < 1 ? location : 1;  // make sure it's less than 1
         setColorAndWidth (songId, location*100, false);
    }


    // width should be in 0-100
    // if avg is true then we're setting the song's avg not the local one
    function setColorAndWidth (songId, width, avg) {
         // Color map:  0 -> fa0000; 
         //            50 -> ffff00; 
         //           100 -> 00fa00;
         var red = width < 50 ? 255 : Math.floor(5*(100-width));
         var green = width < 50 ? Math.floor(5*width) : 255;
         var colorstr = 'rgb('+red+','+green+',0)';
         var avgStr = 'Inner';
         if (avg) { avgStr = 'Avg';}
         $("#"+songId+"_vote"+avgStr).css('background', colorstr);
         $("#"+songId+"_vote"+avgStr).width(width+'%');
    }

    function setVote () {
         var songId = parseInt(this.id);
         var voteValue = $("#"+songId+"_voteInner").width();
         $("#"+songId+"_voteValue").val(voteValue);
         $("#"+songId+"_voteSet").show();
         setTimeout(function() { $("#"+songId+"_voteSet").hide();}, 1500);
         socket.emit('vote', songId, voteValue);
    }

    function setVoteWidth() {
         var songId = parseInt(this.id);
         var width = $("#"+songId+"_voteValue").val();
         setColorAndWidth(songId, width, false); 
    }

function initVotes(socket) {
    socket.on('vote update', function(songId, avg) {
       setColorAndWidth(songId, avg, true);
    });

}