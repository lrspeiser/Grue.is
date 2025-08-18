// Minimal stub for Socket.IO client to avoid 404s when no socket server is present.
// This provides a no-op io() that returns an object with on/emit/connect methods.
(function(){
  if (window.io) return; // do not override if real socket.io is present
  function NoopSocket(){
    this.handlers = {};
  }
  NoopSocket.prototype.on = function(event, handler){
    this.handlers[event] = handler;
  };
  NoopSocket.prototype.emit = function(){ /* no-op */ };
  NoopSocket.prototype.connect = function(){ /* no-op */ };
  NoopSocket.prototype.disconnect = function(){ /* no-op */ };

  window.io = function(){
    return new NoopSocket();
  };
})();
