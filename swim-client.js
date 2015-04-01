'use strict';

var proto = require('swim-proto-js');
var URI = require('uri-js');
var WS = require('websocket').w3cwebsocket;

var getHandlers = {};
var linkHandlers = {};

function reset() {
  for (var endpoint in Channel.bridge) {
    var channel = Channel.bridge[endpoint];
    if (channel instanceof Channel) channel.close();
  }
  Channel.bridge = {};
  getHandlers = {};
  linkHandlers = {};
}


function link(uri, lane, handler) {
  if (typeof handler === 'function') handler = {done: handler};
  if (!handler.error) handler.error = function () {};

  var unlinked = false;
  var nodeHandlers = linkHandlers[uri];
  if (nodeHandlers === undefined) {
    nodeHandlers = {};
    linkHandlers[uri] = nodeHandlers;
  }
  var laneHandlers = nodeHandlers[lane];
  if (laneHandlers === undefined) {
    unlinked = true;
    laneHandlers = [];
    nodeHandlers[lane] = laneHandlers;
  }
  laneHandlers.push(handler);

  if (unlinked) {
    var channel = Channel.get(uri);
    var request = new proto.LinkRequest(channel.relative(uri), lane);
    channel.send(request);
  }
}

function unlink(uri, lane, handler) {
  var nodeHandlers = linkHandlers[uri];
  if (nodeHandlers === undefined) return;
  var laneHandlers = nodeHandlers[lane];
  if (laneHandlers === undefined) return;
  var index = -1;
  if (handler instanceof Function) {
    var i = 0;
    var n = laneHandlers.length;
    while (i < n && index < 0) {
      if (laneHandlers[i].done === handler) index = i;
      else i += 1;
    }
  }
  else index = laneHandlers.indexOf(handler);
  if (index < 0) return;
  laneHandlers.splice(index, 1);
  if (laneHandlers.length === 0) {
    delete nodeHandlers[lane];
    if (nodeHandlers.length === 0) delete linkHandlers[uri];

    var channel = Channel.get(uri);
    var request = new proto.UnlinkRequest(channel.relative(uri), lane);
    channel.send(request);
  }
}

function handleMessage(endpoint, envelope) {
  var uri = URI.resolve(endpoint, envelope.node);
  var nodeHandlers = linkHandlers[uri];
  if (nodeHandlers === undefined) return;
  var laneHandlers = nodeHandlers[envelope.lane];
  if (laneHandlers === undefined) return;
  var i = 0;
  var n = laneHandlers.length;
  while (i < n) {
    var handler = laneHandlers[i];
    handler.done(envelope);
    i += 1;
  }
}


function sendEvent(uri, lane, body) {
  var channel = Channel.get(uri);
  var message = new proto.EventMessage(channel.relative(uri), lane, undefined, body);
  channel.send(message);
}

function sendCommand(uri, lane, body) {
  var channel = Channel.get(uri);
  var message = new proto.CommandMessage(channel.relative(uri), lane, undefined, body);
  channel.send(message);
}


function get(uri, handler) {
  if (typeof handler === 'function') handler = {done: handler};

  var handlers = getHandlers[uri];
  if (handlers === undefined) {
    handlers = [];
    getHandlers[uri] = handlers;
  }
  handlers.push(handler);

  var channel = Channel.get(uri);
  var request = new proto.GetRequest(channel.relative(uri));
  channel.send(request);
}

function put(uri, body, handler) {
  if (typeof handler === 'function') handler = {done: handler};

  var handlers = getHandlers[uri];
  if (handlers === undefined) {
    handlers = [];
    getHandlers[uri] = handlers;
  }
  handlers.push(handler);

  var channel = Channel.get(uri);
  var request = new proto.PutRequest(channel.relative(uri), body);
  channel.send(request);
}

function handleState(endpoint, envelope) {
  var uri = URI.resolve(endpoint, envelope.node);
  var handlers = getHandlers[uri] || [];
  var handler;
  while ((handler = handlers.shift())) {
    handler.done(envelope);
  }
  delete getHandlers[uri];
}


function Channel(uri) {
  this.uri = uri;
  this.socket = new WS(uri, 'swim-0.0');
  this.buffer = [];
  Channel.bridge[uri] = this;
  var that = this;
  this.socket.onopen = function () {
    var envelope;
    while ((envelope = that.buffer.shift())) that.send(envelope);
  };
  this.socket.onclose = function () {
    delete Channel.bridge[that.uri];
    for (var uri in linkHandlers) if (uri.indexOf(that.uri) === 0) {
      var nodeHandlers = linkHandlers[uri];
      if (nodeHandlers !== undefined) {
        delete linkHandlers[uri];
        for (var lane in nodeHandlers) {
          var laneHandlers = nodeHandlers[lane];
          var i = 0;
          var n = laneHandlers.length;
          while (i < n) {
            var handler = laneHandlers[i];
            handler.error();
            i += 1;
          }
        }
      }
    }
  };
  this.socket.onmessage = function (frame) {
    var payload = frame.data;
    if (typeof payload === 'string') {
      var envelope = proto.parse(payload);
      if (envelope) that.receive(envelope);
    }
  };
}
Channel.prototype.send = function (envelope) {
  if (this.socket.readyState !== this.socket.OPEN) this.buffer.push(envelope);
  else this.socket.send(proto.stringify(envelope));
};
Channel.prototype.receive = function (envelope) {
  if (envelope.isEventMessage) handleMessage(this.uri, envelope);
  else if (envelope.isCommandMessage) handleMessage(this.uri, envelope);
  else if (envelope.isStateResponse) handleState(this.uri, envelope);
};
Channel.prototype.close = function () {
  if (this.socket.readyState !== this.socket.CLOSED ||
      this.socket.readyState !== this.socket.CLOSING)
    this.socket.close();
  else delete Channel.bridge[this.uri];
};
Channel.prototype.relative = function (uri) {
  var components = URI.parse(uri);
  return URI.serialize({
    path: components.path,
    query: components.query,
    fragment: components.fragment
  });
};
Channel.bridge = {};
Channel.endpoint = function (uri) {
  var components = URI.parse(uri);
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
Channel.get = function (uri) {
  var endpoint = Channel.endpoint(uri);
  var channel = Channel.bridge[endpoint];
  if (channel === undefined) channel = new Channel(endpoint);
  return channel;
};


exports.reset = reset;
exports.link = link;
exports.unlink = unlink;
exports.sendEvent = sendEvent;
exports.sendCommand = sendCommand;
exports.get = get;
exports.put = put;
