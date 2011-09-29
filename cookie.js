var sessionStore;

this.initCookieHelper = function(sess) {
    sessionStore = sess;
}

// callback should take a single argument the userId
this.getUserId = function(socket, callback) {
  var userId = null;
  sessionStore.get(socket.handshake.sessionID, function(err, session){
    if (session) {
      userId = session.userId;
      callback(userId);
    }
   });

}

module.exports = this;