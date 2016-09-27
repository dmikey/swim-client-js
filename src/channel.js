'use strict';

var proto = require('swim-proto-js');

var recon = require('recon-js');

var UriCache = require('./uricache');
var LinkedDownlink = require('./linkeddownlink');
var SyncedDownlink = require('./synceddownlink');
var ListDownlink = require('./listdownlink');
var MapDownlink = require('./mapdownlink');

function Channel(client, hostUri, options) {
  options = options || {};
  Object.defineProperty(this, 'client', {value: client, configurable: true});
  Object.defineProperty(this, 'hostUri', {value: hostUri, enumerable: true});
  Object.defineProperty(this, 'options', {value: options, enumerable: true});
  Object.defineProperty(this, 'credentials', {value: options.credentials, writable: true});
  Object.defineProperty(this, 'isAuthorized', {value: false, enumerable: true, writable: true});
  Object.defineProperty(this, 'session', {value: null, enumerable: true, writable: true});
  Object.defineProperty(this, 'uriCache', {value: new UriCache(hostUri), configurable: true});
  Object.defineProperty(this, 'delegates', {value: [], configurable: true});
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
Channel.prototype.authorize = function (credentials) {
  if (recon.equal(credentials, this.credentials)) return;
  this.credentials = credentials;
  if (this.isConnected) {
    var request = new proto.AuthRequest(credentials);
    this.push(request);
  } else {
    this.open();
  }
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
Channel.prototype.registerDelegate = function (delegate) {
  this.delegates.push(delegate);
};
Channel.prototype.unregisterDelegate = function (delegate) {
  for (var i = 0, n = this.delegates.length; i < n; i += 1) {
    if (this.delegates[i] === delegate) {
      this.delegates.splice(i, 1);
    }
  }
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
  if (this.isConnected) {
    downlink.onChannelConnect({hostUri: this.hostUri});
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
            if (this.isConnected) {
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
  } else if (envelope.isAuthRequest) {
    this.onAuthRequest(envelope);
  } else if (envelope.isAuthedResponse) {
    this.onAuthedResponse(envelope);
  } else if (envelope.isDeauthRequest) {
    this.onDeauthRequest(envelope);
  } else if (envelope.isDeauthedResponse) {
    this.onDeauthedResponse(envelope);
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
Channel.prototype.onAuthRequest = function (request) {
  // TODO: Support client services.
};
Channel.prototype.onAuthedResponse = function (response) {
  this.isAuthorized = true;
  this.session = response.body;
  var info = {hostUri: this.hostUri, session: this.session};
  this.client.onChannelAuthorize(info);
  for (var i = 0, n = this.delegates.length; i < n; i += 1) {
    var delegate = this.delegates[i];
    delegate.onChannelAuthorize(info);
  }
};
Channel.prototype.onDeauthRequest = function (request) {
  // TODO: Support client services.
};
Channel.prototype.onDeauthedResponse = function (response) {
  this.isAuthorized = false;
  this.session = null;
  var info = {hostUri: this.hostUri, session: response.body};
  this.client.onChannelDeauthorize(info);
  for (var i = 0, n = this.delegates.length; i < n; i += 1) {
    var delegate = this.delegates[i];
    delegate.onChannelDeauthorize(info);
  }
};
Channel.prototype.onConnect = function () {
  var info = {hostUri: this.hostUri};
  this.client.onChannelConnect(info);
  for (var i = 0, n = this.delegates.length; i < n; i += 1) {
    var delegate = this.delegates[i];
    delegate.onChannelConnect(info);
  }
  for (var nodeUri in this.downlinks) {
    var nodeDownlinks = this.downlinks[nodeUri];
    for (var laneUri in nodeDownlinks) {
      var laneDownlinks = nodeDownlinks[laneUri];
      for (i = 0, n = laneDownlinks.length; i < n; i += 1) {
        var downlink = laneDownlinks[i];
        downlink.onChannelConnect(info);
      }
    }
  }
};
Channel.prototype.onDisconnect = function () {
  var info = {hostUri: this.hostUri};
  this.client.onChannelDisconnect(info);
  for (var i = 0, n = this.delegates.length; i < n; i += 1) {
    var delegate = this.delegates[i];
    delegate.onChannelDisconnect(info);
  }
  for (var nodeUri in this.downlinks) {
    var nodeDownlinks = this.downlinks[nodeUri];
    for (var laneUri in nodeDownlinks) {
      var laneDownlinks = nodeDownlinks[laneUri].slice();
      for (i = 0, n = laneDownlinks.length; i < n; i += 1) {
        var downlink = laneDownlinks[i];
        downlink.onChannelDisconnect(info);
      }
    }
  }
};
Channel.prototype.onError = function () {
  var info = {hostUri: this.hostUri};
  this.client.onChannelError(info);
  for (var i = 0, n = this.delegates.length; i < n; i += 1) {
    var delegate = this.delegates[i];
    delegate.onChannelError(info);
  }
  for (var nodeUri in this.downlinks) {
    var nodeDownlinks = this.downlinks[nodeUri];
    for (var laneUri in nodeDownlinks) {
      var laneDownlinks = nodeDownlinks[laneUri];
      for (i = 0, n = laneDownlinks.length; i < n; i += 1) {
        var downlink = laneDownlinks[i];
        downlink.onChannelError(info);
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
Channel.prototype.clearReconnect = function () {
  if (this.reconnectTimer) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectTimeout = 0;
  }
};
Channel.prototype.clearIdle = function () {
  if (this.idleTimer) {
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
};
Channel.prototype.watchIdle = function () {
  if (this.isConnected && this.sendBuffer.length === 0 && Object.keys(this.downlinks).length === 0) {
    this.idleTimer = setTimeout(this.checkIdle.bind(this), this.idleTimeout);
  }
};
Channel.prototype.checkIdle = function () {
  if (this.sendBuffer.length === 0 && Object.keys(this.downlinks).length === 0) {
    this.close();
  }
};
Channel.prototype.close = function () {
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

module.exports = Channel;