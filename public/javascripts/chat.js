function initChat(socket) {
  socket.on('chat users', function(userCount){
    $("#users").text(userCount + " people currently connected");
  });

  socket.on('disconnect', function() {
    socket.emit('disconnect');
  });      

  socket.on('chat name', function(name) {
    $("#chatName").text(name+":");
  });

  socket.on('chat name error', function(msg) {
    alert(msg);
  });

  // if mine == true then display name as chatNameMine
  socket.on('chat message', function(name,msg, mine) {
    var curTime = new Date();
    var timeStr = convertTimeToString(curTime);

    if (name == 'system') {
      $("#chatHistory").append("<p> <span class='chatTime'>"+timeStr+" &nbsp;</span> <em> "+msg+"</em></p>");
    } 
    else {
      var nameClass = mine ? 'chatNameMine' : 'chatNameOther';
      $("#chatHistory").append("<p><span class='chatTime'>"+timeStr+" &nbsp;</span> <strong class='"+nameClass+"'>"+name+"</strong>: "+msg+"</p>");
    }
    $("#chatHistory").prop("scrollTop",$("#chatHistory").prop("scrollHeight"));
  });

  $("#chatNameSubmit").click(function(e) {
    var newName = $("#chatNameSet").val();
    $("#chatNameSet").val('');
    socket.emit('chat name',newName);
  });

  $("#chatMessage").keypress(function(e) {
    if(e.which == 13) {  // on enter key
      var message = $("#chatMessage").val();
      if (message != '') {
        $("#chatMessage").val('');
        socket.emit('chat message', message);
      }
    }
  });
}

// Returns a string like 'HH:MM'
function convertTimeToString(time) {
  var result = '';
  var hours = time.getHours();
  var mins  = time.getMinutes();
  result += hours < 10 ? '0'+hours : hours;
  result += ':';
  result += mins < 10 ? '0'+mins : mins;
  return result;
}
