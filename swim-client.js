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
Object.defineProperty(Client.prototype, 'callChannelWithLinkArgs', {
  value: function (name, args) {
    var hostUri, nodeUri, laneUri, options;
    if (args.length === 2) {
      options = {};
      laneUri = args[1];
      nodeUri = args[0];
      hostUri = Client.extractHostUri(nodeUri);
    } else if (args.length === 3) {
      if (typeof args[2] === 'object') {
        options = args[2];
        laneUri = args[1];
        nodeUri = args[0];
        hostUri = Client.extractHostUri(nodeUri);
      } else {
        hostUri = args[0];
        nodeUri = Client.resolveNodeUri(hostUri, args[1]);
        laneUri = args[2];
        options = {};
      }
    } else {
      hostUri = args[0];
      nodeUri = Client.resolveNodeUri(hostUri, args[1]);
      laneUri = args[2];
      options = args[3];
    }
    var channel = this.getOrCreateChannel(hostUri);
    return channel[name](nodeUri, laneUri, options);
  },
  configurable: true
});
Client.prototype.getOrCreateChannel = function (hostUri) {
  var channel = this.channels[hostUri];
  if (channel === undefined) {
    channel = new Channel(hostUri, this.options);
    this.channels[hostUri] = channel;
  }
  return channel;
};
Client.prototype.downlink = function () {
  return new DownlinkBuilder(null, this);
};
Client.prototype.link = function () {
  return this.callChannelWithLinkArgs('link', arguments);
};
Client.prototype.sync = function () {
  return this.callChannelWithLinkArgs('sync', arguments);
};
Client.prototype.syncList = function () {
  return this.callChannelWithLinkArgs('syncList', arguments);
};
Client.prototype.syncMap = function () {
  return this.callChannelWithLinkArgs('syncMap', arguments);
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
HostScope.prototype.downlink = function () {
  return new DownlinkBuilder(this.channel, this).host(this.hostUri);
};
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
HostScope.prototype.syncList = function (nodeUri, laneUri, options) {
  var downlink = this.channel.syncList(Client.resolveNodeUri(this.hostUri, nodeUri), laneUri, options);
  this.registerDownlink(downlink);
  return downlink;
};
HostScope.prototype.syncMap = function (nodeUri, laneUri, options) {
  var downlink = this.channel.syncMap(Client.resolveNodeUri(this.hostUri, nodeUri), laneUri, options);
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
NodeScope.prototype.downlink = function () {
  return new DownlinkBuilder(this.channel, this).host(this.hostUri).node(this.nodeUri);
};
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
NodeScope.prototype.syncList = function (laneUri, options) {
  var downlink = this.channel.syncList(this.nodeUri, laneUri, options);
  this.registerDownlink(downlink);
  return downlink;
};
NodeScope.prototype.syncMap = function (laneUri, options) {
  var downlink = this.channel.syncMap(this.nodeUri, laneUri, options);
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
LaneScope.prototype.downlink = function () {
  return new DownlinkBuilder(this.channel, this).host(this.hostUri).node(this.nodeUri).lane(this.laneUri);
};
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
LaneScope.prototype.syncList = function (options) {
  var downlink = this.channel.syncList(this.nodeUri, this.laneUri, options);
  this.registerDownlink(downlink);
  return downlink;
};
LaneScope.prototype.syncMap = function (options) {
  var downlink = this.channel.syncMap(this.nodeUri, this.laneUri, options);
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
  var downlink = new LinkedDownlink(this, this.hostUri, nodeUri, laneUri, options);
  this.registerDownlink(downlink);
  return downlink;
};
Channel.prototype.sync = function (nodeUri, laneUri, options) {
  var downlink = new SyncedDownlink(this, this.hostUri, nodeUri, laneUri, options);
  this.registerDownlink(downlink);
  return downlink;
};
Channel.prototype.syncList = function (nodeUri, laneUri, options) {
  var downlink = new ListDownlink(this, this.hostUri, nodeUri, laneUri, options);
  this.registerDownlink(downlink);
  return downlink;
};
Channel.prototype.syncMap = function (nodeUri, laneUri, options) {
  var downlink = new MapDownlink(this, this.hostUri, nodeUri, laneUri, options);
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


function DownlinkBuilder(channel, scope) {
  Object.defineProperty(this, 'channel', {value: channel, configurable: true});
  Object.defineProperty(this, 'scope', {value: scope, configurable: true});
  Object.defineProperty(this, 'proxy', {value: {}, configurable: true});
  this.options = {};
}
DownlinkBuilder.prototype.host = function (hostUri) {
  this.hostUri = hostUri;
  return this;
};
DownlinkBuilder.prototype.node = function (nodeUri) {
  this.nodeUri = nodeUri;
  return this;
};
DownlinkBuilder.prototype.lane = function (laneUri) {
  this.laneUri = laneUri;
  return this;
};
DownlinkBuilder.prototype.prio = function (prio) {
  this.options.prio = prio;
  return this;
};
DownlinkBuilder.prototype.keepAlive = function () {
  this.options.keepAlive = true;
  return this;
};
DownlinkBuilder.prototype.delegate = function (delegate) {
  this.options.delegate = delegate;
  return this;
};
DownlinkBuilder.prototype.onEvent = function (callback) {
  this.proxy.onEvent = callback;
  return this;
};
DownlinkBuilder.prototype.onCommand = function (callback) {
  this.proxy.onCommand = callback;
  return this;
};
DownlinkBuilder.prototype.onLink = function (callback) {
  this.proxy.onLink = callback;
  return this;
};
DownlinkBuilder.prototype.onLinked = function (callback) {
  this.proxy.onLinked = callback;
  return this;
};
DownlinkBuilder.prototype.onSync = function (callback) {
  this.proxy.onSync = callback;
  return this;
};
DownlinkBuilder.prototype.onSynced = function (callback) {
  this.proxy.onSynced = callback;
  return this;
};
DownlinkBuilder.prototype.onUnlink = function (callback) {
  this.proxy.onUnlink = callback;
  return this;
};
DownlinkBuilder.prototype.onUnlinked = function (callback) {
  this.proxy.onUnlinked = callback;
  return this;
};
DownlinkBuilder.prototype.onConnect = function (callback) {
  this.proxy.onConnect = callback;
  return this;
};
DownlinkBuilder.prototype.onDisconnect = function (callback) {
  this.proxy.onDisconnect = callback;
  return this;
};
DownlinkBuilder.prototype.onError = function (callback) {
  this.proxy.onError = callback;
  return this;
};
DownlinkBuilder.prototype.onClose = function (callback) {
  this.proxy.onClose = callback;
  return this;
};
DownlinkBuilder.prototype.primaryKey = function (primaryKey) {
  this.options.primaryKey = primaryKey;
  return this;
};
DownlinkBuilder.prototype.sortBy = function (sortBy) {
  this.options.sortBy = sortBy;
  return this;
};
Object.defineProperty(DownlinkBuilder.prototype, 'normalize', {
  value: function () {
    if (this.hostUri) {
      this.nodeUri = Client.resolveNodeUri(this.hostUri, this.nodeUri);
    } else {
      this.hostUri = Client.extractHostUri(this.nodeUri);
    }
    if (!this.channel) {
      // If channel is null then scope references a Client.
      Object.defineProperty(this, 'channel', {
        value: this.scope.getOrCreateChannel(this.hostUri),
        configurable: true
      });
      Object.defineProperty(this, 'scope', {value: null, configurable: true});
    }
  },
  configurable: true
});
Object.defineProperty(DownlinkBuilder.prototype, 'registerDownlink', {
  value: function (downlink) {
    for (var key in this.proxy) {
      downlink[key] = this.proxy[key];
    }
    this.channel.registerDownlink(downlink);
    if (this.scope) {
      this.scope.registerDownlink(downlink);
    }
  },
  configure: true
});
DownlinkBuilder.prototype.link = function () {
  this.normalize();
  var downlink = new LinkedDownlink(this.channel, this.hostUri, this.nodeUri, this.laneUri, this.options);
  this.registerDownlink(downlink);
  return downlink;
};
DownlinkBuilder.prototype.sync = function () {
  this.normalize();
  var downlink = new SyncedDownlink(this.channel, this.hostUri, this.nodeUri, this.laneUri, this.options);
  this.registerDownlink(downlink);
  return downlink;
};
DownlinkBuilder.prototype.syncList = function () {
  this.normalize();
  var downlink = new ListDownlink(this.channel, this.hostUri, this.nodeUri, this.laneUri, this.options);
  this.registerDownlink(downlink);
  return downlink;
};
DownlinkBuilder.prototype.syncMap = function () {
  this.normalize();
  var downlink = new MapDownlink(this.channel, this.hostUri, this.nodeUri, this.laneUri, this.options);
  this.registerDownlink(downlink);
  return downlink;
};


function Downlink(channel, hostUri, nodeUri, laneUri, options) {
  options = options || {};
  Object.defineProperty(this, 'channel', {value: channel});
  Object.defineProperty(this, 'hostUri', {value: hostUri, enumerable: true});
  Object.defineProperty(this, 'nodeUri', {value: nodeUri, enumerable: true});
  Object.defineProperty(this, 'laneUri', {value: laneUri, enumerable: true});
  Object.defineProperty(this, 'options', {value: options, enumerable: true});
  Object.defineProperty(this, 'delegate', {value: options.delegate || this, writable: true});
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
Object.defineProperty(Downlink.prototype, 'connected', {
  get: function () {
    var socket = this.channel.socket;
    return socket && socket.readyState === socket.OPEN;
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
  value: function () {
    if (typeof this.delegate.onConnect === 'function') {
      this.delegate.onConnect();
    }
  },
  configurable: true
});
Object.defineProperty(Downlink.prototype, 'onChannelDisconnect', {
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
Object.defineProperty(Downlink.prototype, 'onChannelError', {
  value: function () {
    if (typeof this.delegate.onError === 'function') {
      this.delegate.onError();
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
Downlink.prototype.close = function () {
  this.channel.unregisterDownlink(this);
};


function LinkedDownlink(channel, hostUri, nodeUri, laneUri, options) {
  Downlink.call(this, channel, hostUri, nodeUri, laneUri, options);
}
LinkedDownlink.prototype = Object.create(Downlink.prototype);
LinkedDownlink.prototype.constructor = LinkedDownlink;
Object.defineProperty(LinkedDownlink.prototype, 'onChannelConnect', {
  value: function () {
    Downlink.prototype.onChannelConnect.call(this);
    var nodeUri = this.channel.unresolve(this.nodeUri);
    var request = new proto.LinkRequest(nodeUri, this.laneUri, this.prio);
    this.onLinkRequest(request);
    this.channel.push(request);
  },
  configurable: true
});


function SyncedDownlink(channel, hostUri, nodeUri, laneUri, options) {
  Downlink.call(this, channel, hostUri, nodeUri, laneUri, options);
}
SyncedDownlink.prototype = Object.create(Downlink.prototype);
SyncedDownlink.prototype.constructor = SyncedDownlink;
Object.defineProperty(SyncedDownlink.prototype, 'onChannelConnect', {
  value: function () {
    Downlink.prototype.onChannelConnect.call(this);
    var nodeUri = this.channel.unresolve(this.nodeUri);
    var request = new proto.SyncRequest(nodeUri, this.laneUri, this.prio);
    this.onSyncRequest(request);
    this.channel.push(request);
  },
  configurable: true
});


function ListDownlink(channel, hostUri, nodeUri, laneUri, options) {
  SyncedDownlink.call(this, channel, hostUri, nodeUri, laneUri, options);
  Object.defineProperty(this, 'state', {value: [], configurable: true});
}
ListDownlink.prototype = Object.create(SyncedDownlink.prototype);
ListDownlink.prototype.constructor = ListDownlink;
Object.defineProperty(ListDownlink.prototype, 'onEventMessage', {
  value: function (message) {
    var tag = recon.tag(message.body);
    var head, index, value;
    if (tag === '@update') {
      head = recon.head(message.body);
      index = recon.get(head, 'index');
      value = recon.tail(message.body);
      this.remoteUpdate(index, value);
    } else if (tag === '@insert') {
      head = recon.head(message.body);
      index = recon.get(head, 'index');
      value = recon.tail(message.body);
      this.remoteInsert(index, value);
    } else if (tag === '@move') {
      head = recon.head(message.body);
      var from = recon.get(head, 'from');
      var to = recon.get(head, 'to');
      value = recon.tail(message.body);
      this.remoteMove(from, to, value);
    } else if (tag === '@remove' || tag === '@delete') {
      head = recon.head(message.body);
      index = recon.get(head, 'index');
      value = recon.tail(message.body);
      this.remoteRemove(index, value);
    } else if (tag === '@clear' && recon.size(message.body) === 1) {
      this.remoteClear();
    } else {
      this.remoteAppend(message.body);
    }
    SyncedDownlink.prototype.onEventMessage.call(this, message);
  },
  configurable: true
});
Object.defineProperty(ListDownlink.prototype, 'remoteAppend', {
  value: function (value) {
    this.state.push(value);
  },
  configurable: true
});
Object.defineProperty(ListDownlink.prototype, 'remoteUpdate', {
  value: function (index, value) {
    this.state[index] = value;
  },
  configurable: true
});
Object.defineProperty(ListDownlink.prototype, 'remoteInsert', {
  value: function (index, value) {
    if (!recon.equal(this.state[index], value)) {
      this.state.splice(index, 0, value);
    }
  },
  configurable: true
});
Object.defineProperty(ListDownlink.prototype, 'remoteMove', {
  value: function (fromIndex, toIndex, value) {
    if (!recon.equal(this.state[toIndex], value)) {
      this.state.splice(fromIndex, 1);
      this.state.splice(toIndex, 0, value);
    }
  },
  configurable: true
});
Object.defineProperty(ListDownlink.prototype, 'remoteRemove', {
  value: function (index, value) {
    if (recon.equal(this.state[index], value)) {
      this.state.splice(index, 1);
    }
  },
  configurable: true
});
Object.defineProperty(ListDownlink.prototype, 'remoteClear', {
  value: function (index, value) {
    Object.defineProperty(this, 'state', {value: [], configurable: true});
  },
  configurable: true
});
Object.defineProperty(ListDownlink.prototype, 'length', {
  get: function () {
    return this.state.length;
  },
  configurable: true,
  enumerable: true
});
ListDownlink.prototype.get = function (index) {
  return this.state[index];
};
ListDownlink.prototype.set = function (index, value) {
  this.state[index] = value;
  var nodeUri = this.channel.unresolve(this.nodeUri);
  var body = recon.concat(recon({'@update': recon({index: index})}), value);
  var message = new proto.CommandMessage(nodeUri, this.laneUri, body);
  this.onCommandMessage(message);
  this.channel.push(message);
};
ListDownlink.prototype.push = function () {
  var nodeUri = this.channel.unresolve(this.nodeUri);
  for (var i = 0, n = arguments.length; i < n; i += 1) {
    var value = arguments[i];
    this.state.push(value);
    var message = new proto.CommandMessage(nodeUri, this.laneUri, value);
    this.onCommandMessage(message);
    this.channel.push(message);
  }
  return this.state.length;
};
ListDownlink.prototype.pop = function () {
  var value = this.state.pop();
  var index = this.state.length;
  if (value !== undefined) {
    var nodeUri = this.channel.unresolve(this.nodeUri);
    var body = recon.concat(recon({'@remove': recon({index: index})}), value);
    var message = new proto.CommandMessage(nodeUri, this.laneUri, body);
    this.onCommandMessage(message);
    this.channel.push(message);
  }
  return value;
};
ListDownlink.prototype.unshift = function () {
  var nodeUri = this.channel.unresolve(this.nodeUri);
  for (var i = arguments.length - 1; i >= 0; i -= 1) {
    var value = arguments[i];
    this.state.unshift(value);
    var body = recon.concat(recon({'@insert': recon({index: 0})}), value);
    var message = new proto.CommandMessage(nodeUri, this.laneUri, body);
    this.onCommandMessage(message);
    this.channel.push(message);
  }
  return this.state.length;
};
ListDownlink.prototype.shift = function () {
  var value = this.state.shift();
  if (value !== undefined) {
    var nodeUri = this.channel.unresolve(this.nodeUri);
    var body = recon.concat(recon({'@remove': recon({index: 0})}), value);
    var message = new proto.CommandMessage(nodeUri, this.laneUri, body);
    this.onCommandMessage(message);
    this.channel.push(message);
  }
  return value;
};
ListDownlink.prototype.move = function (fromIndex, toIndex) {
  var removed = this.state.splice(fromIndex, 1);
  if (removed.length === 1) {
    var value = removed[0];
    this.state.splice(toIndex, 0, value);
    var nodeUri = this.channel.unresolve(this.nodeUri);
    var body = recon.concat(recon({'@move': recon({from: fromIndex, to: toIndex})}), value);
    var message = new proto.CommandMessage(nodeUri, this.laneUri, body);
    this.onCommandMessage(message);
    this.channel.push(message);
  }
};
ListDownlink.prototype.splice = function () {
  var start = arguments[0];
  var deleteCount = arguments[1];
  var nodeUri = this.channel.unresolve(this.nodeUri);
  var removed = [];
  var i, n, value, body, message;
  for (i = start; i < start + deleteCount; i += 1) {
    value = this.state[i];
    if (value !== undefined) {
      removed.push(value);
      this.state.splice(start, 1);
      body = recon.concat(recon({'@remove': recon({index: start})}), value);
      message = new proto.CommandMessage(nodeUri, this.laneUri, body);
      this.onCommandMessage(message);
      this.channel.push(message);
    }
  }
  for (i = 2, n = arguments.length; i < n; i += 1) {
    var index = start + i - 2;
    value = arguments[i];
    this.state.splice(index, 0, value);
    body = recon.concat(recon({'@insert': recon({index: index})}), value);
    message = new proto.CommandMessage(nodeUri, this.laneUri, body);
    this.onCommandMessage(message);
    this.channel.push(message);
  }
  return removed;
};
ListDownlink.prototype.clear = function () {
  Object.defineProperty(this, 'state', {value: [], configurable: true});
  var nodeUri = this.channel.unresolve(this.nodeUri);
  var message = new proto.CommandMessage(nodeUri, this.laneUri, [{'@clear': null}]);
  this.onCommandMessage(message);
  this.channel.push(message);
  return this;
};
ListDownlink.prototype.forEach = function (callback, thisArg) {
  for (var i = 0, n = this.state.length; i < n; i += 1) {
    var value = this.state[i];
    callback.call(thisArg, value, i, this);
  }
};


function MapDownlink(channel, hostUri, nodeUri, laneUri, options) {
  SyncedDownlink.call(this, channel, hostUri, nodeUri, laneUri, options);
  Object.defineProperty(this, 'state', {value: [], configurable: true});
  Object.defineProperty(this, 'table', {value: {}, configurable: true});
  this.primaryKey = MapDownlink.primaryKeyOption(this.options);
  this.sortBy = MapDownlink.sortByOption(this.options);
}
MapDownlink.prototype = Object.create(SyncedDownlink.prototype);
MapDownlink.prototype.constructor = MapDownlink;
Object.defineProperty(MapDownlink.prototype, 'onEventMessage', {
  value: function (message) {
    var key;
    var tag = recon.tag(message.body);
    if (tag === '@remove' || tag === '@delete') {
      var body = recon.tail(message.body);
      key = this.primaryKey(body);
      if (key !== undefined) {
        this.remoteDelete(key);
      }
    } else if (tag === '@clear' && recon.size(message.body) === 1) {
      this.remoteClear();
    } else {
      key = this.primaryKey(message.body);
      if (key !== undefined) {
        this.remoteSet(key, message.body);
      }
    }
    SyncedDownlink.prototype.onEventMessage.call(this, message);
  },
  configurable: true
});
Object.defineProperty(MapDownlink.prototype, 'remoteSet', {
  value: function (key, value) {
    if (typeof key === 'string') {
      this.table[key] = value;
    }
    for (var i = 0, n = this.state.length; i < n; i += 1) {
      var oldValue = this.state[i];
      var id = this.primaryKey(oldValue);
      if (recon.equal(key, id)) {
        this.state[i] = value;
        break;
      }
    }
    if (i === n) {
      this.state.push(value);
    }
    this.sort();
  },
  configurable: true
});
Object.defineProperty(MapDownlink.prototype, 'remoteDelete', {
  value: function (key) {
    if (typeof key === 'string') {
      delete this.table[key];
    }
    for (var i = 0, n = this.state.length; i < n; i += 1) {
      var value = this.state[i];
      var id = this.primaryKey(value);
      if (recon.equal(key, id)) {
        this.state.splice(i, 1);
        return;
      }
    }
  },
  configurable: true
});
Object.defineProperty(MapDownlink.prototype, 'remoteClear', {
  value: function (key) {
    Object.defineProperty(this, 'state', {value: [], configurable: true});
    Object.defineProperty(this, 'table', {value: {}, configurable: true});
  },
  configurable: true
});
Object.defineProperty(MapDownlink.prototype, 'size', {
  get: function () {
    return this.state.length;
  },
  configurable: true,
  enumerable: true
});
MapDownlink.prototype.has = function (key) {
  if (typeof key === 'string') {
    return this.table[key] !== undefined;
  } else {
    for (var i = 0, n = this.state.length; i < n; i += 1) {
      var value = this.state[i];
      var id = this.primaryKey(value);
      if (recon.equal(key, id)) {
        return true;
      }
    }
  }
  return false;
};
MapDownlink.prototype.get = function (key) {
  if (typeof key === 'string') {
    return this.table[key];
  } else {
    for (var i = 0, n = this.state.length; i < n; i += 1) {
      var value = this.state[i];
      var id = this.primaryKey(value);
      if (recon.equal(key, id)) {
        return value;
      }
    }
  }
};
MapDownlink.prototype.set = function (key, value) {
  if (typeof key === 'string') {
    this.table[key] = value;
  }
  for (var i = 0, n = this.state.length; i < n; i += 1) {
    var oldValue = this.state[i];
    var id = this.primaryKey(oldValue);
    if (recon.equal(key, id)) {
      this.state[i] = value;
      break;
    }
  }
  if (i === n) {
    this.state.push(value);
  }
  this.sort();
  var nodeUri = this.channel.unresolve(this.nodeUri);
  var message = new proto.CommandMessage(nodeUri, this.laneUri, value);
  this.onCommandMessage(message);
  this.channel.push(message);
  return this;
};
MapDownlink.prototype.delete = function (key) {
  if (typeof key === 'string') {
    delete this.table[key];
  }
  for (var i = 0, n = this.state.length; i < n; i += 1) {
    var value = this.state[i];
    var id = this.primaryKey(value);
    if (recon.equal(key, id)) {
      this.state.splice(i, 1);
      var nodeUri = this.channel.unresolve(this.nodeUri);
      var body = recon.concat(recon({'@remove': null}), value);
      var message = new proto.CommandMessage(nodeUri, this.laneUri, body);
      this.onCommandMessage(message);
      this.channel.push(message);
      return true;
    }
  }
  return false;
};
MapDownlink.prototype.clear = function () {
  Object.defineProperty(this, 'state', {value: [], configurable: true});
  Object.defineProperty(this, 'table', {value: {}, configurable: true});
  var nodeUri = this.channel.unresolve(this.nodeUri);
  var message = new proto.CommandMessage(nodeUri, this.laneUri, [{'@clear': null}]);
  this.onCommandMessage(message);
  this.channel.push(message);
  return this;
};
MapDownlink.prototype.sort = function () {
  if (this.sortBy) {
    this.state.sort(this.sortBy);
  }
};
MapDownlink.prototype.keys = function () {
  var keys = [];
  for (var i = 0, n = this.state.length; i < n; i += 1) {
    var value = this.state[i];
    var key = this.primaryKey(value);
    if (key !== undefined) {
      keys.push(key);
    }
  }
  return keys;
};
MapDownlink.prototype.values = function () {
  return this.state;
};
MapDownlink.prototype.forEach = function (callback, thisArg) {
  for (var i = 0, n = this.state.length; i < n; i += 1) {
    var value = this.state[i];
    callback.call(thisArg, value, this);
  }
};
MapDownlink.primaryKeyOption = function (options) {
  if (typeof options.primaryKey === 'function') {
    return options.primaryKey;
  } else if (typeof options.primaryKey === 'string') {
    var keys = options.primaryKey.split('.');
    return function (value) {
      for (var i = 0, n = keys.length; i < n; i += 1) {
        var key = keys[i];
        value = recon.get(value, key);
      }
      return value;
    };
  } else {
    return MapDownlink.identityKey;
  }
};
MapDownlink.identityKey = function (value) { return value; };
MapDownlink.sortByOption = function (options) {
  if (typeof options.sortBy === 'function') {
    return options.sortBy;
  } else if (typeof options.sortBy === 'string') {
    var keys = options.sortBy.split('.');
    return function (x, y) {
      for (var i = 0, n = keys.length; i < n; i += 1) {
        var key = keys[i];
        x = recon.get(x, key);
        y = recon.get(y, key);
        return recon.compare(x, y);
      }
    };
  }
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
