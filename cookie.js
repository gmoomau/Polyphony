var sessionStore;

this.initCookieHelper = function(sess) {
    sessionStore = sess;
}

this.getUserId = function(socket) {
  var userId = null;
  sessionStore.get(socket.handshake.sessionID, function(err, session){
    if (session) {
      userId = session.userId;
    }
   });
  return userId;
}

module.exports = this;