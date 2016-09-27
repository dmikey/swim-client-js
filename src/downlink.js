
'use strict';
function Downlink(channel, hostUri, nodeUri, laneUri, options) {
  options = options || {};
  Object.defineProperty(this, 'channel', {value: channel});
  Object.defineProperty(this, 'hostUri', {value: hostUri, enumerable: true});
  Object.defineProperty(this, 'nodeUri', {value: nodeUri, enumerable: true});
  Object.defineProperty(this, 'laneUri', {value: laneUri, enumerable: true});
  Object.defineProperty(this, 'options', {value: options, enumerable: true});
  Object.defineProperty(this, 'delegate', {value: options.delegate || this, enumerable: true, writable: true});
}
Object.defineProperty(Downlink.prototype, 'prio', {
  get: function () {
    return this.options.prio || 0.0;
  }
});
Object.defineProperty(Downlink.prototype, 'keepAlive', {
  get: function () {
    return this.options.keepAlive || false;
  },
  set: function (keepAlive) {
    this.options.keepAlive = keepAlive;
  }
});
Object.defineProperty(Downlink.prototype, 'isConnected', {
  get: function () {
    return this.channel.isConnected;
  },
  enumerable: true
});
Object.defineProperty(Downlink.prototype, 'isAuthorized', {
  get: function () {
    return this.channel.isAuthorized;
  },
  enumerable: true
});
Object.defineProperty(Downlink.prototype, 'session', {
  get: function () {
    return this.channel.session;
  },
  enumerable: true
});
Object.defineProperty(Downlink.prototype, 'onEventMessage', {
  value: function (message) {
    if (typeof this.delegate.onEvent === 'function') {
      this.delegate.onEvent(message);
    }
  },
  configurable: true
});
Object.defineProperty(Downlink.prototype, 'onCommandMessage', {
  value: function (message) {
    if (typeof this.delegate.onCommand === 'function') {
      this.delegate.onCommand(message);
    }
  },
  configurable: true
});
Object.defineProperty(Downlink.prototype, 'onLinkRequest', {
  value: function (request) {
    if (typeof this.delegate.onLink === 'function') {
      this.delegate.onLink(request);
    }
  },
  configurable: true
});
Object.defineProperty(Downlink.prototype, 'onLinkedResponse', {
  value: function (response) {
    if (typeof this.delegate.onLinked === 'function') {
      this.delegate.onLinked(response);
    }
  },
  configurable: true
});
Object.defineProperty(Downlink.prototype, 'onSyncRequest', {
  value: function (request) {
    if (typeof this.delegate.onSync === 'function') {
      this.delegate.onSync(request);
    }
  },
  configurable: true
});
Object.defineProperty(Downlink.prototype, 'onSyncedResponse', {
  value: function (response) {
    if (typeof this.delegate.onSynced === 'function') {
      this.delegate.onSynced(response);
    }
  },
  configurable: true
});
Object.defineProperty(Downlink.prototype, 'onUnlinkRequest', {
  value: function (request) {
    if (typeof this.delegate.onUnlink === 'function') {
      this.delegate.onUnlink(request);
    }
  },
  configurable: true
});
Object.defineProperty(Downlink.prototype, 'onUnlinkedResponse', {
  value: function (response) {
    if (typeof this.delegate.onUnlinked === 'function') {
      this.delegate.onUnlinked(response);
    }
  },
  configurable: true
});
Object.defineProperty(Downlink.prototype, 'onChannelConnect', {
  value: function (info) {
    if (typeof this.delegate.onConnect === 'function') {
      this.delegate.onConnect(info);
    }
  },
  configurable: true
});
Object.defineProperty(Downlink.prototype, 'onChannelDisconnect', {
  value: function (info) {
    if (typeof this.delegate.onDisconnect === 'function') {
      this.delegate.onDisconnect(info);
    }
    if (!this.keepAlive) {
      this.close();
    }
  },
  configurable: true
});
Object.defineProperty(Downlink.prototype, 'onChannelError', {
  value: function (info) {
    if (typeof this.delegate.onError === 'function') {
      this.delegate.onError(info);
    }
  },
  configurable: true
});
Object.defineProperty(Downlink.prototype, 'onChannelClose', {
  value: function () {
    if (typeof this.delegate.onClose === 'function') {
      this.delegate.onClose();
    }
  },
  configurable: true
});
Downlink.prototype.command = function (body) {
  this.channel.command(this.nodeUri, this.laneUri, body);
};
Downlink.prototype.close = function () {
  this.channel.unregisterDownlink(this);
};

module.exports = Downlink;