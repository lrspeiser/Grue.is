// Socket.IO client library stub for serverless deployment
// In a serverless environment, Socket.IO won't work traditionally
// This is a placeholder to prevent 404 errors

console.log('[Socket.IO] Running in serverless mode - WebSocket connections disabled');

// Minimal Socket.IO client API to prevent errors
window.io = function(url, options) {
  return {
    on: function(event, callback) {
      console.log('[Socket.IO] Event listener registered for:', event);
    },
    emit: function(event, data) {
      console.log('[Socket.IO] Event emitted:', event, data);
    },
    connect: function() {
      console.log('[Socket.IO] Connect called (no-op in serverless)');
    },
    disconnect: function() {
      console.log('[Socket.IO] Disconnect called (no-op in serverless)');
    },
    connected: false
  };
};