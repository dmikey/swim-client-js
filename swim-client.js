'use strict';

var proto = require('swim-proto-js');
var URI = require('uri-js');
var WS = require('websocket').w3cwebsocket;

var options = {
  SEND_BUFFER_SIZE: 1024
};

var LINK_FAILED = -2;
var LINK_BROKEN = -1;
var LINK_WANTED = 0;
var LINK_ACTIVE = 1;

function nop() {}

function link(node, lane, handle) {
  Channel.get(node).link(node, lane, handle);
}

function unlink(node, lane, handle) {
  Channel.get(node).unlink(node, lane, handle);
}

function sendEvent(node, lane, body) {
  Channel.get(node).sendEvent(node, lane, body);
}

function sendCommand(node, lane, body) {
  Channel.get(node).sendCommand(node, lane, body);
}

function get(node, handle) {
  Channel.get(node).get(node, handle);
}

function put(node, body, handle) {
  Channel.get(node).put(node, body, handle);
}

function reset() {
  for (var endpoint in Channel.bridge) {
    var channel = Channel.bridge[endpoint];
    channel.sendBuffer = [];
    channel.unlinkAll();
    channel.close();
  }
  Channel.bridge = {};
}


function Channel(node) {
  Channel.bridge[node] = this;
  this.node = node;
  this.linkCount = 0;
  this.linkHandles = {};
  this.stateHandles = {};
  this.sendBuffer = [];
  this.reconnectTimeout = null;
  this.reconnectTime = 1000;
  this.closed = false;
  this.open();
}
Channel.prototype.open = function () {
  this.socket = new WS(this.node, 'swim-0.0');
  this.socket.onopen = this.onOpen.bind(this);
  this.socket.onclose = this.onClose.bind(this);
  this.socket.onmessage = this.onFrame.bind(this);
};
Channel.prototype.close = function () {
  this.closed = true;
  this.socket.close();
};
Channel.prototype.send = function (envelope) {
  if (this.socket.readyState !== this.socket.OPEN) this.buffer(envelope);
  else this.socket.send(proto.stringify(envelope));
};
Channel.prototype.buffer = function (envelope) {
  if (envelope.isLinkRequest || envelope.isUnlinkRequest) return;
  if (this.sendBuffer.length > options.SEND_BUFFER_SIZE) return; // TODO: Notify
  this.sendBuffer.push(envelope);
};
Channel.prototype.onOpen = function () {
  clearTimeout(this.reconnectTimeout);
  this.reconnectTime = 1000;

  var envelope;
  for (var node in this.linkHandles) {
    var nodeHandles = this.linkHandles[node];
    for (var lane in nodeHandles) {
      envelope = new proto.LinkRequest(this.unresolve(node), lane);
      this.send(envelope);
    }
  }

  while ((envelope = this.sendBuffer.shift())) this.send(envelope);
};
Channel.prototype.onClose = function () {
  if (this.linkCount === 0 && this.sendBuffer.length === 0) {
    delete Channel.bridge[this.node];
    return;
  }

  for (var node in this.linkHandles) {
    var nodeHandles = this.linkHandles[node];
    for (var lane in nodeHandles) {
      var laneHandles = nodeHandles[lane];
      for (var i = 0, n = laneHandles.length; i < n; i += 1) {
        var handle = laneHandles[i];
        var state = handle.__state__;
        if (state.status === LINK_ACTIVE) {
          handle.onBroken(node, lane);
          state.status = LINK_BROKEN;
        }
      }
    }
  }

  if (!this.closed) {
    this.reconnectTimeout = setTimeout(this.open.bind(this), this.reconnectTime);
    this.reconnectTime = Math.min(2 * this.reconnectTime, 30000);
  }
};
Channel.prototype.onFrame = function (frame) {
  var payload = frame.data;
  if (typeof payload === 'string') {
    var envelope = proto.parse(payload);
    if (envelope) this.onReceive(envelope);
  }
};
Channel.prototype.link = function (node, lane, handle) {
  if (typeof handle === 'function') handle = {
    onEvent: handle,
    onCommand: handle
  };
  if (!handle.onEvent) handle.onEvent = nop;
  if (!handle.onCommand) handle.onCommand = nop;
  if (!handle.onLinked) handle.onLinked = nop;
  if (!handle.onUnlinked) handle.onUnlinked = nop;
  if (!handle.onBroken) handle.onBroken = nop;
  if (!handle.onUnbroken) handle.onUnbroken = nop;
  if (!handle.onFailed) handle.onFailed = nop;
  var state = {
    status: LINK_WANTED
  };
  handle.__state__ = state;

  var unlinked = false;
  var nodeHandles = this.linkHandles[node];
  if (nodeHandles === undefined) {
    nodeHandles = {};
    this.linkHandles[node] = nodeHandles;
  }
  var laneHandles = nodeHandles[lane];
  if (laneHandles === undefined) {
    unlinked = true;
    laneHandles = [];
    nodeHandles[lane] = laneHandles;
  }
  laneHandles.push(handle);

  if (unlinked) {
    var request = new proto.LinkRequest(this.unresolve(node), lane);
    this.send(request);
    this.linkCount += 1;
  }
  else if (this.socket.readyState === this.socket.OPEN) {
    handle.onLinked(node, lane);
    state.status = LINK_ACTIVE;
  }
};
Channel.prototype.unlink = function (node, lane, handle) {
  var nodeHandles = this.linkHandles[node];
  if (nodeHandles === undefined) return;
  var laneHandles = nodeHandles[lane];
  if (laneHandles === undefined) return;
  var index = -1;
  if (handle instanceof Function) for (var i = 0, n = laneHandles.length; i < n; i += 1) {
    if (laneHandles[i].onEvent === handle) { index = i; break; }
  }
  else index = laneHandles.indexOf(handle);
  if (index < 0) return;
  laneHandles.splice(index, 1);
  if (laneHandles.length === 0) {
    delete nodeHandles[lane];
    if (Object.keys(nodeHandles).length === 0) delete this.linkHandles[node];

    var request = new proto.UnlinkRequest(this.unresolve(node), lane);
    this.send(request);
    this.linkCount -= 1;
  }
};
Channel.prototype.unlinkAll = function () {
  for (var node in this.linkHandles) {
    var nodeHandles = this.linkHandles[node];
    for (var lane in nodeHandles) {
      var laneHandles = nodeHandles[lane];
      for (var i = 0, n = laneHandles.length; i < n; i += 1) {
        var handle = laneHandles[i];
        var state = handle.__state__;
        handle.onFailed(node, lane);
        state.status = LINK_FAILED;
      }
    }
  }
  this.linkCount = 0;
  this.linkHandles = {};
};
Channel.prototype.sendEvent = function (node, lane, body) {
  var message = new proto.EventMessage(this.unresolve(node), lane, undefined, body);
  this.send(message);
};
Channel.prototype.sendCommand = function (node, lane, body) {
  var message = new proto.CommandMessage(this.unresolve(node), lane, undefined, body);
  this.send(message);
};
Channel.prototype.get = function (node, handle) {
  if (typeof handle === 'function') handle = {onState: handle};

  var handles = this.stateHandles[node];
  if (handles === undefined) {
    handles = [];
    this.stateHandles[node] = handles;
  }
  handles.push(handle);

  var request = new proto.GetRequest(this.unresolve(node));
  this.send(request);
};
Channel.prototype.put = function (node, body, handle) {
  if (handle === undefined) handle = nop;
  if (typeof handle === 'function') handle = {onState: handle};

  var handles = this.stateHandles[node];
  if (handles === undefined) {
    handles = [];
    this.stateHandles[node] = handles;
  }
  handles.push(handle);

  var request = new proto.PutRequest(this.unresolve(node), body);
  this.send(request);
};
Channel.prototype.onReceive = function (envelope) {
  if (envelope.isEventMessage) this.onMessage(envelope);
  else if (envelope.isCommandMessage) this.onMessage(envelope);
  else if (envelope.isStateResponse) this.onState(envelope);
  else if (envelope.isLinkedResponse) this.onLinked(envelope);
  else if (envelope.isUnlinkedResponse) this.onUnlinked(envelope);
};
Channel.prototype.onMessage = function (envelope) {
  var node = URI.resolve(this.node, envelope.node);
  var nodeHandles = this.linkHandles[node];
  if (nodeHandles === undefined) return;

  var lane = envelope.lane;
  while (lane) {
    var laneHandles = nodeHandles[lane];
    if (laneHandles) for (var i = 0, n = laneHandles.length; i < n; i += 1) {
      var handle = laneHandles[i];
      if (envelope.isEventMessage) handle.onEvent(envelope);
      else handle.onCommand(envelope);
    }
    lane = Channel.parentLane(lane);
  }
};
Channel.prototype.onState = function (envelope) {
  var node = URI.resolve(this.node, envelope.node);
  var handles = this.stateHandles[node] || [];
  var handle;
  while ((handle = handles.shift())) {
    handle.onState(envelope);
  }
  delete this.stateHandles[node];
};
Channel.prototype.onLinked = function (envelope) {
  var node = URI.resolve(this.node, envelope.node);
  var lane = envelope.lane;
  var nodeHandles = this.linkHandles[node];
  if (nodeHandles === undefined) return;
  var laneHandles = nodeHandles[lane];
  if (laneHandles === undefined) return;
  for (var i = 0, n = laneHandles.length; i < n; i += 1) {
    var handle = laneHandles[i];
    var state = handle.__state__;
    if (state.status === LINK_BROKEN) handle.onUnbroken(node, lane);
    else handle.onLinked(node, lane);
    state.status = LINK_ACTIVE;
  }
};
Channel.prototype.onUnlinked = function (envelope) {
  var node = URI.resolve(this.node, envelope.node);
  var lane = envelope.lane;
  var nodeHandles = this.linkHandles[node];
  if (nodeHandles === undefined) return;
  var laneHandles = nodeHandles[lane];
  if (laneHandles === undefined) return;
  for (var i = 0, n = laneHandles.length; i < n; i += 1) {
    var handle = laneHandles[i];
    var state = handle.__state__;
    if (state.status === LINK_ACTIVE) {
      handle.onUnlinked(node, lane);
      state.status = LINK_WANTED;
    }
    else {
      handle.onFailed(node, lane);
      state.status = LINK_FAILED;
    }
  }
  delete nodeHandles[lane];
  if (Object.keys(nodeHandles).length === 0) delete this.linkHandles[node];
  this.linkCount -= 1;
};
Channel.prototype.unresolve = function (node) {
  var components = URI.parse(node);
  return URI.serialize({
    path: components.path,
    query: components.query,
    fragment: components.fragment
  });
};
Channel.bridge = {};
Channel.get = function (node) {
  var endpoint = Channel.endpoint(node);
  var channel = Channel.bridge[endpoint];
  if (channel === undefined) channel = new Channel(endpoint);
  return channel;
};
Channel.endpoint = function (node) {
  var components = URI.parse(node);
  var scheme = components.scheme;
  if (scheme === 'swim') scheme = 'http';
  else if (scheme === 'swims') scheme = 'https';
  return URI.serialize({
    scheme: scheme,
    userinfo: components.userinfo,
    host: components.host,
    port: components.port
  });
};
Channel.parentLane = function (lane) {
  var components = URI.parse(lane);
  var path = components.path;
  if (components.query && components.fragment) return URI.serialize({
    path: path,
    query: components.query
  });
  else if (components.query) return URI.serialize({path: path});
  else if (path.length > 0) {
    if (path.charCodeAt(path.length - 1) === 47 /*'/'*/) {
      path = path.substring(0, path.length - 1);
      return URI.serialize({path: path});
    }
    else {
      var i = path.lastIndexOf('/');
      if (i > 0) {
        path = path.substring(0, i + 1);
        return URI.serialize({path: path});
      }
    }
  }
};


exports.link = link;
exports.unlink = unlink;
exports.sendEvent = sendEvent;
exports.sendCommand = sendCommand;
exports.get = get;
exports.put = put;
exports.reset = reset;
exports.options = options;
