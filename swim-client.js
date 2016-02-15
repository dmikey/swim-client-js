'use strict';

var config = require('./config.json');
var recon = require('recon-js');
var proto = require('swim-proto-js');
var WebSocket = global.WebSocket || require('websocket').w3cwebsocket;


function Client(options) {
  options = options || {};
  Object.defineProperty(this, 'options', {value: options, enumerable: true});
  Object.defineProperty(this, 'channels', {value: {}, configurable: true});
}
Client.prototype.getOrCreateChannel = function (hostUri) {
  var channel = this.channels[hostUri];
  if (channel === undefined) {
    channel = new Channel(hostUri, this.options);
    this.channels[hostUri] = channel;
  }
  return channel;
};
Client.prototype.link = function () {
  var hostUri, nodeUri, laneUri, options;
  if (arguments.length === 2) {
    options = {};
    laneUri = arguments[1];
    nodeUri = arguments[0];
    hostUri = Client.extractHostUri(nodeUri);
  } else if (arguments.length === 3) {
    if (typeof arguments[2] === 'object') {
      options = arguments[2];
      laneUri = arguments[1];
      nodeUri = arguments[0];
      hostUri = Client.extractHostUri(nodeUri);
    } else {
      hostUri = arguments[0];
      nodeUri = Client.resolveNodeUri(hostUri, arguments[1]);
      laneUri = arguments[2];
      options = {};
    }
  } else {
    hostUri = arguments[0];
    nodeUri = Client.resolveNodeUri(hostUri, arguments[1]);
    laneUri = arguments[2];
    options = arguments[3];
  }
  var channel = this.getOrCreateChannel(hostUri);
  return channel.link(nodeUri, laneUri, options);
};
Client.prototype.sync = function () {
  var hostUri, nodeUri, laneUri, options;
  if (arguments.length === 2) {
    options = {};
    laneUri = arguments[1];
    nodeUri = arguments[0];
    hostUri = Client.extractHostUri(nodeUri);
  } else if (arguments.length === 3) {
    if (typeof arguments[2] === 'object') {
      options = arguments[2];
      laneUri = arguments[1];
      nodeUri = arguments[0];
      hostUri = Client.extractHostUri(nodeUri);
    } else {
      hostUri = arguments[0];
      nodeUri = Client.resolveNodeUri(hostUri, arguments[1]);
      laneUri = arguments[2];
      options = {};
    }
  } else {
    hostUri = arguments[0];
    nodeUri = Client.resolveNodeUri(hostUri, arguments[1]);
    laneUri = arguments[2];
    options = arguments[3];
  }
  var channel = this.getOrCreateChannel(hostUri);
  return channel.sync(nodeUri, laneUri, options);
};
Client.prototype.syncMap = function () {
  var hostUri, nodeUri, args, i, n;
  if (arguments.length >= 3 && typeof arguments[2] === 'string') {
    hostUri = arguments[0];
    nodeUri = Client.resolveNodeUri(hostUri, arguments[1]);
    args = [nodeUri];
    for (i = 2, n = arguments.length; i < n; i += 1) {
      args.push(arguments[i]);
    }
  } else {
    nodeUri = arguments[0];
    hostUri = Client.extractHostUri(nodeUri);
    args = [nodeUri];
    for (i = 1, n = arguments.length; i < n; i += 1) {
      args.push(arguments[i]);
    }
  }
  var channel = this.getOrCreateChannel(hostUri);
  return channel.syncMap.apply(channel, args);
};
Client.prototype.command = function () {
  var hostUri, nodeUri, laneUri, body;
  if (arguments.length === 3) {
    body = arguments[2];
    laneUri = arguments[1];
    nodeUri = arguments[0];
    hostUri = Client.extractHostUri(nodeUri);
  } else {
    hostUri = arguments[0];
    nodeUri = Client.resolveNodeUri(hostUri, arguments[1]);
    laneUri = arguments[2];
    body = arguments[3];
  }
  var channel = this.getOrCreateChannel(hostUri);
  channel.command(nodeUri, laneUri, body);
};
Client.prototype.host = function (hostUri) {
  var channel = this.getOrCreateChannel(hostUri);
  return new HostScope(channel, hostUri);
};
Client.prototype.node = function () {
  var hostUri, nodeUri;
  if (arguments.length === 1) {
    nodeUri = arguments[0];
    hostUri = Client.extractHostUri(nodeUri);
  } else {
    hostUri = arguments[0];
    nodeUri = Client.resolveNodeUri(hostUri, arguments[1]);
  }
  var channel = this.getOrCreateChannel(hostUri);
  return new NodeScope(channel, hostUri, nodeUri);
};
Client.prototype.lane = function () {
  var hostUri, nodeUri, laneUri;
  if (arguments.length === 2) {
    laneUri = arguments[1];
    nodeUri = arguments[0];
    hostUri = Client.extractHostUri(nodeUri);
  } else {
    hostUri = arguments[0];
    nodeUri = Client.resolveNodeUri(hostUri, arguments[1]);
    laneUri = arguments[2];
  }
  var channel = this.getOrCreateChannel(hostUri);
  return new LaneScope(channel, hostUri, nodeUri, laneUri);
};
Client.prototype.close = function () {
  var channels = this.channels;
  Object.defineProperty(this, 'channels', {value: {}, configurable: true});
  for (var hostUri in channels) {
    var channel = channels[hostUri];
    channel.close();
  }
};
Client.extractHostUri = function (nodeUri) {
  var uri = recon.uri.parse(nodeUri);
  var scheme = uri.scheme;
  if (scheme === 'swim') scheme = 'ws';
  else if (scheme === 'swims') scheme = 'wss';
  return recon.uri.stringify({
    scheme: scheme,
    authority: uri.authority
  });
};
Client.resolveNodeUri = function (hostUri, nodeUri) {
  return recon.uri.stringify(recon.uri.resolve(hostUri, nodeUri));
};


function Scope() {
  Object.defineProperty(this, 'downlinks', {value: [], configurable: true});
}
Scope.prototype.registerDownlink = function (downlink) {
  var scope = this;
  Object.defineProperty(downlink, 'onChannelClose', {
    value: function () {
      scope.unregisterDownlink(downlink);
      downlink.__proto__.onChannelClose.call(downlink);
    },
    configurable: true
  });
  this.downlinks.push(downlink);
};
Scope.prototype.unregisterDownlink = function (downlink) {
  for (var i = 0, n = this.downlinks.length; i < n; i += 1) {
    if (downlink === this.downlinks[i]) {
      this.downlinks.splice(i, 1);
      return;
    }
  }
};
Scope.prototype.close = function () {
  var downlinks = this.downlinks;
  Object.defineProperty(this, 'downlinks', {value: [], configurable: true});
  for (var i = 0, n = downlinks.length; i < n; i += 1) {
    var downlink = downlinks[i];
    downlink.__proto__.onChannelClose.call(downlink);
  }
};


function HostScope(channel, hostUri) {
  Scope.call(this);
  Object.defineProperty(this, 'channel', {value: channel});
  Object.defineProperty(this, 'hostUri', {value: hostUri, enumerable: true});
  Object.defineProperty(this, 'downlinks', {value: [], configurable: true});
}
HostScope.prototype = Object.create(Scope.prototype);
HostScope.prototype.constructor = HostScope;
HostScope.prototype.link = function (nodeUri, laneUri, options) {
  var downlink = this.channel.link(Client.resolveNodeUri(this.hostUri, nodeUri), laneUri, options);
  this.registerDownlink(downlink);
  return downlink;
};
HostScope.prototype.sync = function (nodeUri, laneUri, options) {
  var downlink = this.channel.sync(Client.resolveNodeUri(this.hostUri, nodeUri), laneUri, options);
  this.registerDownlink(downlink);
  return downlink;
};
HostScope.prototype.syncMap = function () {
  arguments[0] = Client.resolveNodeUri(this.hostUri, arguments[0]);
  var downlink = this.channel.syncMap.apply(this.channel, arguments);
  this.registerDownlink(downlink);
  return downlink;
};
HostScope.prototype.command = function (nodeUri, laneUri, body) {
  this.channel.command(Client.resolveNodeUri(this.hostUri, nodeUri), laneUri, body);
};
HostScope.prototype.node = function (nodeUri) {
  return new NodeScope(this.channel, this.hostUri, Client.resolveNodeUri(this.hostUri, nodeUri));
};
HostScope.prototype.lane = function (nodeUri, laneUri) {
  return new LaneScope(this.channel, this.hostUri, Client.resolveNodeUri(this.hostUri, nodeUri), laneUri);
};


function NodeScope(channel, hostUri, nodeUri) {
  Scope.call(this);
  Object.defineProperty(this, 'channel', {value: channel});
  Object.defineProperty(this, 'hostUri', {value: hostUri, enumerable: true});
  Object.defineProperty(this, 'nodeUri', {value: nodeUri, enumerable: true});
  Object.defineProperty(this, 'downlinks', {value: [], configurable: true});
}
NodeScope.prototype = Object.create(Scope.prototype);
NodeScope.prototype.constructor = NodeScope;
NodeScope.prototype.link = function (laneUri, options) {
  var downlink = this.channel.link(this.nodeUri, laneUri, options);
  this.registerDownlink(downlink);
  return downlink;
};
NodeScope.prototype.sync = function (laneUri, options) {
  var downlink = this.channel.sync(this.nodeUri, laneUri, options);
  this.registerDownlink(downlink);
  return downlink;
};
NodeScope.prototype.syncMap = function () {
  var args = [this.nodeUri];
  Array.prototype.push.apply(args, arguments);
  var downlink = this.channel.syncMap.apply(this.channel, args);
  this.registerDownlink(downlink);
  return downlink;
};
NodeScope.prototype.command = function (laneUri, body) {
  this.channel.command(this.nodeUri, laneUri, body);
};
NodeScope.prototype.lane = function (laneUri) {
  return new LaneScope(this.channel, this.hostUri, this.nodeUri, laneUri);
};


function LaneScope(channel, hostUri, nodeUri, laneUri) {
  Scope.call(this);
  Object.defineProperty(this, 'channel', {value: channel});
  Object.defineProperty(this, 'hostUri', {value: hostUri, enumerable: true});
  Object.defineProperty(this, 'nodeUri', {value: nodeUri, enumerable: true});
  Object.defineProperty(this, 'laneUri', {value: laneUri, enumerable: true});
  Object.defineProperty(this, 'downlinks', {value: [], configurable: true});
}
LaneScope.prototype = Object.create(Scope.prototype);
LaneScope.prototype.constructor = LaneScope;
LaneScope.prototype.link = function (options) {
  var downlink = this.channel.link(this.nodeUri, this.laneUri, options);
  this.registerDownlink(downlink);
  return downlink;
};
LaneScope.prototype.sync = function (options) {
  var downlink = this.channel.sync(this.nodeUri, this.laneUri, options);
  this.registerDownlink(downlink);
  return downlink;
};
LaneScope.prototype.syncMap = function () {
  var args = [this.nodeUri, this.laneUri];
  Array.prototype.push.apply(args, arguments);
  var downlink = this.channel.syncMap.apply(this.channel, args);
  this.registerDownlink(downlink);
  return downlink;
};
LaneScope.prototype.command = function (body) {
  this.channel.command(this.nodeUri, this.laneUri, body);
};


function Channel(hostUri, options) {
  Object.defineProperty(this, 'hostUri', {value: hostUri, enumerable: true});
  Object.defineProperty(this, 'options', {value: options, enumerable: true});
  Object.defineProperty(this, 'uriCache', {value: new UriCache(hostUri), configurable: true});
  Object.defineProperty(this, 'downlinks', {value: {}, configurable: true});
  Object.defineProperty(this, 'sendBuffer', {value: [], configurable: true});
  Object.defineProperty(this, 'reconnectTimer', {value: null, writable: true});
  Object.defineProperty(this, 'reconnectTimeout', {value: 0, writable: true});
  Object.defineProperty(this, 'idleTimer', {value: null, writable: true});
  Object.defineProperty(this, 'socket', {value: null, writable: true});
}
Object.defineProperty(Channel.prototype, 'protocols', {
  get: function () {
    return this.options.protocols;
  }
});
Object.defineProperty(Channel.prototype, 'maxReconnectTimeout', {
  get: function () {
    return this.options.maxReconnectTimeout || 30000;
  }
});
Object.defineProperty(Channel.prototype, 'idleTimeout', {
  get: function () {
    return this.options.idleTimeout || 1000;
  }
});
Object.defineProperty(Channel.prototype, 'sendBufferSize', {
  get: function () {
    return this.options.sendBufferSize || 1024;
  }
});
Channel.prototype.resolve = function (unresolvedUri) {
  return this.uriCache.resolve(unresolvedUri);
};
Channel.prototype.unresolve = function (resolvedUri) {
  return this.uriCache.unresolve(resolvedUri);
};
Channel.prototype.link = function (nodeUri, laneUri, options) {
  var downlink = new ChannelLinkedDownlink(this, this.hostUri, nodeUri, laneUri, options);
  this.registerDownlink(downlink);
  return downlink;
};
Channel.prototype.sync = function (nodeUri, laneUri, options) {
  var downlink = new ChannelSyncedDownlink(this, this.hostUri, nodeUri, laneUri, options);
  this.registerDownlink(downlink);
  return downlink;
};
Channel.prototype.syncMap = function () {
  var nodeUri = arguments[0];
  var laneUri = arguments[1];
  var options, primaryKey;
  for (var i = 2, n = arguments.length; i < n; i += 1) {
    var arg = arguments[i];
    if (typeof arg === 'function') {
      primaryKey = arg;
    } else if (typeof arg === 'object') {
      options = arg;
    }
  }
  primaryKey = primaryKey || function (body) { return body; };
  var downlink = new ChannelMapDownlink(this, this.hostUri, nodeUri, laneUri, options, primaryKey);
  this.registerDownlink(downlink);
  return downlink;
};
Channel.prototype.command = function (nodeUri, laneUri, body) {
  var message = new proto.CommandMessage(this.unresolve(nodeUri), laneUri, body);
  this.push(message);
};
Channel.prototype.registerDownlink = function (downlink) {
  this.clearIdle();
  var nodeUri = downlink.nodeUri;
  var laneUri = downlink.laneUri;
  var nodeDownlinks = this.downlinks[nodeUri] || {};
  var laneDownlinks = nodeDownlinks[laneUri] || [];
  laneDownlinks.push(downlink);
  nodeDownlinks[laneUri] = laneDownlinks;
  this.downlinks[nodeUri] = nodeDownlinks;
  if (this.socket && this.socket.readyState === this.socket.OPEN) {
    downlink.onChannelConnect();
  } else {
    this.open();
  }
};
Channel.prototype.unregisterDownlink = function (downlink) {
  var nodeUri = downlink.nodeUri;
  var laneUri = downlink.laneUri;
  var nodeDownlinks = this.downlinks[nodeUri];
  if (nodeDownlinks) {
    var laneDownlinks = nodeDownlinks[laneUri];
    if (laneDownlinks) {
      for (var i = 0, n = laneDownlinks.length; i < n; i += 1) {
        if (laneDownlinks[i] === downlink) {
          laneDownlinks.splice(i, 1);
          if (laneDownlinks.length === 0) {
            delete nodeDownlinks[laneUri];
            if (Object.keys(nodeDownlinks).length === 0) {
              delete this.downlinks[nodeUri];
              this.watchIdle();
            }
            if (this.socket && this.socket.readyState === this.socket.OPEN) {
              var request = new proto.UnlinkRequest(this.unresolve(nodeUri), laneUri);
              downlink.onUnlinkRequest(request);
              this.push(request);
            }
          }
          downlink.onChannelClose();
        }
      }
    }
  }
};
Channel.prototype.onEnvelope = function (envelope) {
  if (envelope.isEventMessage) {
    this.onEventMessage(envelope);
  } else if (envelope.isCommandMessage) {
    this.onCommandMessage(envelope);
  } else if (envelope.isLinkRequest) {
    this.onLinkRequest(envelope);
  } else if (envelope.isLinkedResponse) {
    this.onLinkedResponse(envelope);
  } else if (envelope.isSyncRequest) {
    this.onSyncRequest(envelope);
  } else if (envelope.isSyncedResponse) {
    this.onSyncedResponse(envelope);
  } else if (envelope.isUnlinkRequest) {
    this.onUnlinkRequest(envelope);
  } else if (envelope.isUnlinkedResponse) {
    this.onUnlinkedResponse(envelope);
  }
};
Channel.prototype.onEventMessage = function (message) {
  var nodeUri = this.resolve(message.node);
  var laneUri = message.lane;
  var nodeDownlinks = this.downlinks[nodeUri];
  if (nodeDownlinks) {
    var laneDownlinks = nodeDownlinks[laneUri];
    if (laneDownlinks) {
      var resolvedMessage = message.withAddress(nodeUri);
      for (var i = 0, n = laneDownlinks.length; i < n; i += 1) {
        var downlink = laneDownlinks[i];
        downlink.onEventMessage(resolvedMessage);
      }
    }
  }
};
Channel.prototype.onCommandMessage = function (message) {
  // TODO: Support client services.
};
Channel.prototype.onLinkRequest = function (request) {
  // TODO: Support client services.
};
Channel.prototype.onLinkedResponse = function (response) {
  var nodeUri = this.resolve(response.node);
  var laneUri = response.lane;
  var nodeDownlinks = this.downlinks[nodeUri];
  if (nodeDownlinks) {
    var laneDownlinks = nodeDownlinks[laneUri];
    if (laneDownlinks) {
      var resolvedResponse = response.withAddress(nodeUri);
      for (var i = 0, n = laneDownlinks.length; i < n; i += 1) {
        var downlink = laneDownlinks[i];
        downlink.onLinkedResponse(resolvedResponse);
      }
    }
  }
};
Channel.prototype.onSyncRequest = function (request) {
  // TODO: Support client services.
};
Channel.prototype.onSyncedResponse = function (response) {
  var nodeUri = this.resolve(response.node);
  var laneUri = response.lane;
  var nodeDownlinks = this.downlinks[nodeUri];
  if (nodeDownlinks) {
    var laneDownlinks = nodeDownlinks[laneUri];
    if (laneDownlinks) {
      var resolvedResponse = response.withAddress(nodeUri);
      for (var i = 0, n = laneDownlinks.length; i < n; i += 1) {
        var downlink = laneDownlinks[i];
        downlink.onSyncedResponse(resolvedResponse);
      }
    }
  }
};
Channel.prototype.onUnlinkRequest = function (request) {
  // TODO: Support client services.
};
Channel.prototype.onUnlinkedResponse = function (response) {
  var nodeUri = this.resolve(response.node);
  var laneUri = response.lane;
  var nodeDownlinks = this.downlinks[nodeUri];
  if (nodeDownlinks) {
    var laneDownlinks = nodeDownlinks[laneUri];
    if (laneDownlinks) {
      delete nodeDownlinks[laneUri];
      if (Object.keys(nodeDownlinks).length === 0) {
        delete this.downlinks[nodeUri];
      }
      var resolvedResponse = response.withAddress(nodeUri);
      for (var i = 0, n = laneDownlinks.length; i < n; i += 1) {
        var downlink = laneDownlinks[i];
        downlink.onUnlinkedResponse(resolvedResponse);
        downlink.onChannelClose();
      }
    }
  }
};
Channel.prototype.onConnect = function () {
  for (var nodeUri in this.downlinks) {
    var nodeDownlinks = this.downlinks[nodeUri];
    for (var laneUri in nodeDownlinks) {
      var laneDownlinks = nodeDownlinks[laneUri];
      for (var i = 0, n = laneDownlinks.length; i < n; i += 1) {
        var downlink = laneDownlinks[i];
        downlink.onChannelConnect();
      }
    }
  }
};
Channel.prototype.onDisconnect = function () {
  for (var nodeUri in this.downlinks) {
    var nodeDownlinks = this.downlinks[nodeUri];
    for (var laneUri in nodeDownlinks) {
      var laneDownlinks = nodeDownlinks[laneUri].slice();
      for (var i = 0, n = laneDownlinks.length; i < n; i += 1) {
        var downlink = laneDownlinks[i];
        downlink.onChannelDisconnect();
      }
    }
  }
};
Channel.prototype.onError = function () {
  for (var nodeUri in this.downlinks) {
    var nodeDownlinks = this.downlinks[nodeUri];
    for (var laneUri in nodeDownlinks) {
      var laneDownlinks = nodeDownlinks[laneUri];
      for (var i = 0, n = laneDownlinks.length; i < n; i += 1) {
        var downlink = laneDownlinks[i];
        downlink.onChannelError();
      }
    }
  }
};
Channel.prototype.open = function () {
  if (this.reconnectTimer) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectTimeout = 0;
  }
  if (!this.socket) {
    this.socket = new WebSocket(this.hostUri, this.protocols);
    this.socket.onopen = this.onWebSocketOpen.bind(this);
    this.socket.onmessage = this.onWebSocketMessage.bind(this);
    this.socket.onerror = this.onWebSocketError.bind(this);
    this.socket.onclose = this.onWebSocketClose.bind(this);
  }
};
Channel.prototype.close = function () {
  this.clearIdle();
  if (this.socket) {
    this.socket.close();
    this.socket = null;
  }
  var downlinks = this.downlinks;
  Object.defineProperty(this, 'downlinks', {value: {}, configurable: true});
  for (var nodeUri in downlinks) {
    var nodeDownlinks = downlinks[nodeUri];
    for (var laneUri in nodeDownlinks) {
      var laneDownlinks = nodeDownlinks[laneUri];
      for (var i = 0, n = laneDownlinks.length; i < n; i += 1) {
        var downlink = laneDownlinks[i];
        downlink.onChannelClose();
      }
    }
  }
};
Channel.prototype.reconnect = function () {
  if (this.reconnectTimer) return;
  if (!this.reconnectTimeout) {
    var jitter = 1000 * Math.random();
    this.reconnectTimeout = 500 + jitter;
  } else {
    var maxReconnectTimeout = this.maxReconnectTimeout || 30000;
    this.reconnectTimeout = Math.min(1.8 * this.reconnectTimeout, maxReconnectTimeout);
  }
  this.reconnectTimer = setTimeout(this.open.bind(this), this.reconnectTimeout);
};
Channel.prototype.clearIdle = function () {
  if (this.idleTimer) {
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
};
Channel.prototype.watchIdle = function () {
  if (this.socket && this.socket.readyState === this.socket.OPEN &&
      this.sendBuffer.length === 0 && Object.keys(this.downlinks).length === 0) {
    this.idleTimer = setTimeout(this.checkIdle.bind(this), this.idleTimeout);
  }
};
Channel.prototype.checkIdle = function () {
  if (this.sendBuffer.length === 0 && Object.keys(this.downlinks).length === 0) {
    this.close();
  }
};
Channel.prototype.push = function (envelope) {
  if (this.socket && this.socket.readyState === this.socket.OPEN) {
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
Channel.prototype.onWebSocketOpen = function () {
  this.onConnect();
  var envelope;
  while ((envelope = this.sendBuffer.shift())) {
    this.push(envelope);
  }
  this.watchIdle();
};
Channel.prototype.onWebSocketMessage = function (message) {
  var data = message.data;
  if (typeof data === 'string') {
    var envelope = proto.parse(data);
    if (envelope) {
      this.onEnvelope(envelope);
    }
  }
};
Channel.prototype.onWebSocketError = function () {
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
Channel.prototype.onWebSocketClose = function () {
  this.socket = null;
  this.onDisconnect();
  this.clearIdle();
  if (this.sendBuffer.length > 0 || Object.keys(this.downlinks).length > 0) {
    this.reconnect();
  }
};


function ChannelDownlink(channel, hostUri, nodeUri, laneUri, options) {
  options = options || {};
  Object.defineProperty(this, 'channel', {value: channel});
  Object.defineProperty(this, 'hostUri', {value: hostUri, enumerable: true});
  Object.defineProperty(this, 'nodeUri', {value: nodeUri, enumerable: true});
  Object.defineProperty(this, 'laneUri', {value: laneUri, enumerable: true});
  Object.defineProperty(this, 'options', {value: options, enumerable: true});
  Object.defineProperty(this, 'delegate', {value: this, writable: true});
}
Object.defineProperty(ChannelDownlink.prototype, 'prio', {
  get: function () {
    return this.options.prio || 0.0;
  }
});
Object.defineProperty(ChannelDownlink.prototype, 'keepAlive', {
  get: function () {
    return this.options.keepAlive || false;
  },
  set: function (keepAlive) {
    this.options.keepAlive = keepAlive;
  }
});
Object.defineProperty(ChannelDownlink.prototype, 'connected', {
  get: function () {
    var socket = this.channel.socket;
    return socket && socket.readyState === socket.OPEN;
  },
  enumerable: true
});
Object.defineProperty(ChannelDownlink.prototype, 'onEventMessage', {
  value: function (message) {
    if (typeof this.delegate.onEvent === 'function') {
      this.delegate.onEvent(message);
    }
  },
  configurable: true
});
Object.defineProperty(ChannelDownlink.prototype, 'onCommandMessage', {
  value: function (message) {
    if (typeof this.delegate.onCommand === 'function') {
      this.delegate.onCommand(message);
    }
  },
  configurable: true
});
Object.defineProperty(ChannelDownlink.prototype, 'onLinkRequest', {
  value: function (request) {
    if (typeof this.delegate.onLink === 'function') {
      this.delegate.onLink(request);
    }
  },
  configurable: true
});
Object.defineProperty(ChannelDownlink.prototype, 'onLinkedResponse', {
  value: function (response) {
    if (typeof this.delegate.onLinked === 'function') {
      this.delegate.onLinked(response);
    }
  },
  configurable: true
});
Object.defineProperty(ChannelDownlink.prototype, 'onSyncRequest', {
  value: function (request) {
    if (typeof this.delegate.onSync === 'function') {
      this.delegate.onSync(request);
    }
  },
  configurable: true
});
Object.defineProperty(ChannelDownlink.prototype, 'onSyncedResponse', {
  value: function (response) {
    if (typeof this.delegate.onSynced === 'function') {
      this.delegate.onSynced(response);
    }
  },
  configurable: true
});
Object.defineProperty(ChannelDownlink.prototype, 'onUnlinkRequest', {
  value: function (request) {
    if (typeof this.delegate.onUnlink === 'function') {
      this.delegate.onUnlink(request);
    }
  },
  configurable: true
});
Object.defineProperty(ChannelDownlink.prototype, 'onUnlinkedResponse', {
  value: function (response) {
    if (typeof this.delegate.onUnlinked === 'function') {
      this.delegate.onUnlinked(response);
    }
  },
  configurable: true
});
Object.defineProperty(ChannelDownlink.prototype, 'onChannelConnect', {
  value: function () {
    if (typeof this.delegate.onConnect === 'function') {
      this.delegate.onConnect();
    }
  },
  configurable: true
});
Object.defineProperty(ChannelDownlink.prototype, 'onChannelDisconnect', {
  value: function () {
    if (typeof this.delegate.onDisconnect === 'function') {
      this.delegate.onDisconnect();
    }
    if (!this.keepAlive) {
      this.close();
    }
  },
  configurable: true
});
Object.defineProperty(ChannelDownlink.prototype, 'onChannelError', {
  value: function () {
    if (typeof this.delegate.onError === 'function') {
      this.delegate.onError();
    }
  },
  configurable: true
});
Object.defineProperty(ChannelDownlink.prototype, 'onChannelClose', {
  value: function () {
    if (typeof this.delegate.onClose === 'function') {
      this.delegate.onClose();
    }
  },
  configurable: true
});
ChannelDownlink.prototype.close = function () {
  this.channel.unregisterDownlink(this);
};


function ChannelLinkedDownlink(channel, hostUri, nodeUri, laneUri, options) {
  ChannelDownlink.call(this, channel, hostUri, nodeUri, laneUri, options);
}
ChannelLinkedDownlink.prototype = Object.create(ChannelDownlink.prototype);
ChannelLinkedDownlink.prototype.constructor = ChannelLinkedDownlink;
Object.defineProperty(ChannelLinkedDownlink.prototype, 'onChannelConnect', {
  value: function () {
    ChannelDownlink.prototype.onChannelConnect.call(this);
    var nodeUri = this.channel.unresolve(this.nodeUri);
    var request = new proto.LinkRequest(nodeUri, this.laneUri, this.prio);
    this.onLinkRequest(request);
    this.channel.push(request);
  },
  configurable: true
});


function ChannelSyncedDownlink(channel, hostUri, nodeUri, laneUri, options) {
  ChannelDownlink.call(this, channel, hostUri, nodeUri, laneUri, options);
}
ChannelSyncedDownlink.prototype = Object.create(ChannelDownlink.prototype);
ChannelSyncedDownlink.prototype.constructor = ChannelSyncedDownlink;
Object.defineProperty(ChannelSyncedDownlink.prototype, 'onChannelConnect', {
  value: function () {
    ChannelDownlink.prototype.onChannelConnect.call(this);
    var nodeUri = this.channel.unresolve(this.nodeUri);
    var request = new proto.SyncRequest(nodeUri, this.laneUri, this.prio);
    this.onSyncRequest(request);
    this.channel.push(request);
  },
  configurable: true
});


function ChannelMapDownlink(channel, hostUri, nodeUri, laneUri, options, primaryKey) {
  ChannelSyncedDownlink.call(this, channel, hostUri, nodeUri, laneUri, options);
  this.primaryKey = primaryKey;
  this.state = [];
}
ChannelMapDownlink.prototype = Object.create(ChannelSyncedDownlink.prototype);
ChannelMapDownlink.prototype.constructor = ChannelMapDownlink;
Object.defineProperty(ChannelMapDownlink.prototype, 'onEventMessage', {
  value: function (message) {
    var key;
    var tag = recon.tag(message.body);
    if (tag === '@remove') {
      var body = recon.tail(message.body);
      key = this.primaryKey(body);
      if (key !== undefined) {
        recon.remove(this.state, key);
      }
    } else {
      key = this.primaryKey(message.body);
      if (key !== undefined) {
        recon.set(this.state, key, message.body);
      }
    }
    ChannelSyncedDownlink.prototype.onEventMessage.call(this, message);
  },
  configurable: true
});
Object.defineProperty(ChannelMapDownlink.prototype, 'size', {
  get: function () {
    return recon.size(this.state);
  },
  configurable: true,
  enumerable: true
});
ChannelMapDownlink.prototype.has = function (key) {
  return recon.has(this.state, key);
};
ChannelMapDownlink.prototype.get = function (key) {
  return recon.get(this.state, key);
};
ChannelMapDownlink.prototype.set = function (key, value) {
  recon.set(this.state, key, value);
  var nodeUri = this.channel.unresolve(this.nodeUri);
  var message = new proto.CommandMessage(nodeUri, this.laneUri, value);
  this.onCommandMessage(message);
  this.channel.push(message);
  return this;
};
ChannelMapDownlink.prototype.delete = function (key) {
  var value = recon.get(this.state, key);
  if (value !== undefined) {
    recon.remove(this.state, key);
    var nodeUri = this.channel.unresolve(this.nodeUri);
    var body = recon.concat({'@remove': null}, value);
    var message = new proto.CommandMessage(nodeUri, this.laneUri, body);
    this.onCommandMessage(message);
    this.channel.push(message);
    return true;
  } else {
    return false;
  }
};
ChannelMapDownlink.prototype.clear = function () {
  this.state = [];
  var nodeUri = this.channel.unresolve(this.nodeUri);
  var message = new proto.CommandMessage(nodeUri, this.laneUri, {'@clear': null});
  this.onCommandMessage(message);
  this.channel.push(message);
  return this;
};
ChannelMapDownlink.prototype.keys = function () {
  return recon.keys(this.state);
};
ChannelMapDownlink.prototype.values = function () {
  return recon.values(this.state);
};
ChannelMapDownlink.prototype.forEach = function (callback, thisArg) {
  return recon.forEach(this.state, callback, thisArg);
};


function UriCache(baseUri, size) {
  size = size || 32;
  Object.defineProperty(this, 'baseUri', {value: baseUri, enumerable: true});
  Object.defineProperty(this, 'base', {value: recon.uri.parse(baseUri)});
  Object.defineProperty(this, 'size', {value: size, enumerable: true});
  Object.defineProperty(this, 'resolveCache', {value: new Array(size)});
  Object.defineProperty(this, 'unresolveCache', {value: new Array(size)});
}
UriCache.prototype.resolve = function (unresolvedUri) {
  var hashBucket = Math.abs(UriCache.hash(unresolvedUri) % this.size);
  var cacheEntry = this.resolveCache[hashBucket];
  if (cacheEntry && cacheEntry.unresolved === unresolvedUri) {
    return cacheEntry.resolved;
  } else {
    var resolvedUri = recon.uri.stringify(recon.uri.resolve(this.base, unresolvedUri));
    this.resolveCache[hashBucket] = {
      unresolved: unresolvedUri,
      resolved: resolvedUri
    };
    return resolvedUri;
  }
};
UriCache.prototype.unresolve = function (resolvedUri) {
  var hashBucket = Math.abs(UriCache.hash(resolvedUri) % this.size);
  var cacheEntry = this.unresolveCache[hashBucket];
  if (cacheEntry && cacheEntry.resolved === resolvedUri) {
    return cacheEntry.unresolved;
  } else {
    var unresolvedUri = recon.uri.stringify(recon.uri.unresolve(this.base, resolvedUri));
    this.unresolveCache[hashBucket] = {
      unresolved: unresolvedUri,
      resolved: resolvedUri
    };
    return unresolvedUri;
  }
};
UriCache.rotl = function (value, distance) {
  return (value << distance) | (value >>> (32 - distance));
};
UriCache.mix = function (code, value) {
  // MurmurHash3 mix function
  value *= 0xcc9e2d51;
  value = UriCache.rotl(value, 15);
  value *= 0x1b873593;
  code ^= value;
  code = UriCache.rotl(code, 13);
  code = code * 5 + 0xe6546b64;
  return code;
};
UriCache.mash = function (code) {
  // MurmurHash3 finalize function
  code ^= code >>> 16;
  code *= 0x85ebca6b;
  code ^= code >>> 13;
  code *= 0xc2b2ae35;
  code ^= code >>> 16;
  return code;
};
UriCache.hash = function (string) {
  var code = 0;
  for (var i = 0, n = string.length; i < n; i += 1) {
    code = UriCache.mix(code, string.charAt(i));
  }
  code = UriCache.mash(code);
  return code;
};


var swim = new Client();
swim.client = function (options) {
  return new Client(options);
};
swim.config = config;

module.exports = swim;
