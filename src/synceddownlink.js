'use strict';

var proto = require('swim-proto-js');
var Downlink = require('./downlink');

function SyncedDownlink(channel, hostUri, nodeUri, laneUri, options) {
  Downlink.call(this, channel, hostUri, nodeUri, laneUri, options);
}
SyncedDownlink.prototype = Object.create(Downlink.prototype);
SyncedDownlink.prototype.constructor = SyncedDownlink;
Object.defineProperty(SyncedDownlink.prototype, 'onChannelConnect', {
  value: function (info) {
    Downlink.prototype.onChannelConnect.call(this, info);
    var nodeUri = this.channel.unresolve(this.nodeUri);
    var request = new proto.SyncRequest(nodeUri, this.laneUri, this.prio);
    this.onSyncRequest(request);
    this.channel.push(request);
  },
  configurable: true
});

module.exports = SyncedDownlink;