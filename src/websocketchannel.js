'use strict';

var proto = require('swim-proto-js');
var Channel = require('./channel');

function WebSocketChannel(client, hostUri, options) {
    Channel.call(this, client, hostUri, options);
}
WebSocketChannel.prototype = Object.create(Channel.prototype);
WebSocketChannel.prototype.constructor = WebSocketChannel;
Object.defineProperty(WebSocketChannel.prototype, 'isConnected', {
    get: function () {
        return this.socket && this.socket.readyState === this.socket.OPEN;
    },
    enumerable: true
});
WebSocketChannel.prototype.open = function () {
    this.clearReconnect();
    if (!this.socket) {
        this.socket = this.protocols ?
            new WebSocket(this.hostUri, this.protocols) :
            new WebSocket(this.hostUri);
        this.socket.onopen = this.onWebSocketOpen.bind(this);
        this.socket.onmessage = this.onWebSocketMessage.bind(this);
        this.socket.onerror = this.onWebSocketError.bind(this);
        this.socket.onclose = this.onWebSocketClose.bind(this);
    }
};
WebSocketChannel.prototype.close = function () {
    this.clearReconnect();
    this.clearIdle();
    if (this.socket) {
        this.socket.close();
        this.socket = null;
    }
    Channel.prototype.close.call(this);
};
WebSocketChannel.prototype.push = function (envelope) {
    if (this.isConnected) {
        this.clearIdle();
        var text = proto.stringify(envelope);
        this.socket.send(text);
        this.watchIdle();
    } else if (envelope.isCommandMessage) {
        if (this.sendBuffer.length < this.sendBufferSize) {
            this.sendBuffer.push(envelope);
        } else {
            // TODO
        }
        this.open();
    }
};
WebSocketChannel.prototype.onWebSocketOpen = function () {
    if (this.credentials) {
        var request = new proto.AuthRequest(this.credentials);
        this.push(request);
    }
    this.onConnect();
    var envelope;
    while ((envelope = this.sendBuffer.shift())) {
        this.push(envelope);
    }
    this.watchIdle();
};
WebSocketChannel.prototype.onWebSocketMessage = function (message) {
    var data = message.data;
    if (typeof data === 'string') {
        var envelope = proto.parse(data);
        if (envelope) {
            this.onEnvelope(envelope);
        }
    }
};
WebSocketChannel.prototype.onWebSocketError = function () {
    this.onError();
    this.clearIdle();
    if (this.socket) {
        this.socket.onopen = null;
        this.socket.onmessage = null;
        this.socket.onerror = null;
        this.socket.onclose = null;
        this.socket.close();
        this.socket = null;
    }
};
WebSocketChannel.prototype.onWebSocketClose = function () {
    this.isAuthorized = false;
    this.session = null;
    this.socket = null;
    this.onDisconnect();
    this.clearIdle();
    if (this.sendBuffer.length > 0 || Object.keys(this.downlinks).length > 0) {
        this.reconnect();
    }
};

module.exports = WebSocketChannel;