
'use strict';

var proto = require('swim-proto-js');
var recon = require('recon-js');
var SyncedDownlink = require('./synceddownlink');

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
  value = recon(value !== undefined ? value : this.get(index));
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
    var value = recon(arguments[i]);
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
    var value = recon(arguments[i]);
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
    value = recon(arguments[i]);
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

module.exports = ListDownlink;