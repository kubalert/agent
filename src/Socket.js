const WebSocket = require('ws');

module.exports = class Socket {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.init();
  }

  get open() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  init() {
    this.initDate = Date.now();
    const socket = new WebSocket(this.url, {
      headers: {
        'source-token': this.token,
      },
    });
    socket.on('error', () => {});
    socket.on('open', () => {
      console.log('Connected to kubalert.io');
    });
    socket.on('close', () => {
      if (!this.initDate) {
        return;
      }
      this.restartTimeout = setTimeout(() => {
        this.init();
      }, (Date.now() - this.initDate > 1000) ? 10000 : 10000);
    });
    if (this.socket) {
      this.socket.terminate();
    }
    this.socket = socket;
  }

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(data);
      } catch (err) {}
    }
  }

  close() {
    this.initDate = null;
    clearTimeout(this.restartTimeout);
    this.socket.terminate();
  }
}
