'use strict';

var proto = require('swim-proto-js');

var recon = require('recon-js');
var Channel = require('./channel');
var LineIterator = require('./lineiterator');

function HttpSocketChannel(client, hostUri, options) {
  Channel.call(this, client, hostUri, options);
  Object.defineProperty(this, 'channelId', {value: null, writable: true});
  Object.defineProperty(this, 'parser', {value: null, writable: true});
  Object.defineProperty(this, 'offset', {value: 0, writable: true});
  Object.defineProperty(this, 'sendTimer', {value: null, writable: true});
}
HttpSocketChannel.prototype = Object.create(Channel.prototype);
HttpSocketChannel.prototype.constructor = HttpSocketChannel;
Object.defineProperty(HttpSocketChannel.prototype, 'sendDelay', {
  get: function () {
    return this.options.sendDelay || 100;
  }
});
Object.defineProperty(HttpSocketChannel.prototype, 'isConnected', {
  get: function () {
    return this.socket && this.socket.readyState >= 1;
  },
  enumerable: true
});
HttpSocketChannel.prototype.throttleSend = function () {
  if (!this.sendTimer) {
    this.sendTimer = setTimeout(this.send.bind(this), this.sendDelay);
  }
};
HttpSocketChannel.prototype.clearSend = function () {
  if (this.sendTimer) {
    clearTimeout(this.sendTimer);
    this.sendTimer = null;
  }
};
HttpSocketChannel.prototype.open = function () {
  this.clearReconnect();
  if (!this.socket) {
    this.socket = new XMLHttpRequest();
    this.socket.open('POST', this.hostUri);
    this.socket.onreadystatechange = this.onHttpSocketChange.bind(this);
    this.socket.onloadstart = this.onHttpSocketOpen.bind(this);
    this.socket.onprogress = this.onHttpSocketData.bind(this);
    this.socket.onload = this.onHttpSocketData.bind(this);
    this.socket.onerror = this.onHttpSocketError.bind(this);
    this.socket.onloadend = this.onHttpSocketClose.bind(this);
    this.socket.setRequestHeader('X-Swim-Connection', 'Upgrade');
    this.socket.send();
  }
};
HttpSocketChannel.prototype.close = function () {
  this.clearReconnect();
  this.clearIdle();
  this.clearSend();
  if (this.socket) {
    this.socket.abort();
    this.socket = null;
  }
  Channel.prototype.close.call(this);
};
HttpSocketChannel.prototype.send = function () {
  this.clearSend();
  if (!this.channelId) {
    this.throttleSend();
    return;
  }
  var request = new XMLHttpRequest();
  request.open('POST', this.hostUri);
  request.setRequestHeader('X-Swim-Channel', this.channelId);
  this.watchIdle();
  var body = '';
  var envelope;
  while ((envelope = this.sendBuffer.shift())) {
    body = body + proto.stringify(envelope) + '\n';
  }
  request.send(body);
};
HttpSocketChannel.prototype.push = function (envelope) {
  if (this.isConnected) {
    this.clearIdle();
    this.sendBuffer.push(envelope);
    this.throttleSend();
  } else if (envelope.isCommandMessage) {
    if (this.sendBuffer.length < this.sendBufferSize) {
      this.sendBuffer.push(envelope);
    } else {
      // TODO
    }
    this.open();
  }
};
HttpSocketChannel.prototype.onHttpSocketOpen = function () {
  this.parser = new recon.BlockParser();
  this.offset = 0;
  this.onConnect();
  this.watchIdle();
};

HttpSocketChannel.prototype.onHttpSocketChange = function () {
  if (this.socket.readyState === 2) {
    this.channelId = this.socket.getResponseHeader('X-Swim-Channel');
    if (!this.channelId) {
      this.socket.abort();
    }
  }
};

HttpSocketChannel.prototype.onHttpSocketData = function () {
  var input = new LineIterator(this.socket.responseText, this.offset, true);
  while ((!input.isInputEmpty() || input.isInputDone()) && this.parser.isCont()) {
    var next = this.parser;
    while ((!input.isEmpty() || input.isDone()) && next.isCont()) {
      next = next.feed(input);
    }
    if (!input.isInputEmpty() && input.head() === 10/*'\n'*/) {
      input.step();
    }
    this.offset = input.index;
    if (next.isDone()) {
      var envelope = proto.decode(next.state());
      if (envelope) {
        this.onEnvelope(envelope);
      }
      this.parser = new recon.BlockParser();
    } else if (next.isError()) {
      // TODO
      this.parser = new recon.BlockParser();
      break;
    } else {
      this.parser = next;
    }
  }
};
HttpSocketChannel.prototype.onHttpSocketError = function () {
  this.onError();
  this.clearIdle();
};
HttpSocketChannel.prototype.onHttpSocketClose = function () {
  this.isAuthorized = false;
  this.session = null;
  this.socket = null;
  this.onDisconnect();
  this.clearIdle();
  if (this.sendBuffer.length > 0 || Object.keys(this.downlinks).length > 0) {
    this.reconnect();
  }
};

module.exports = HttpSocketChannel;