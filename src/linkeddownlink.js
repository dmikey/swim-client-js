'use strict';

var proto = require('swim-proto-js');
var Downlink = require('./downlink');

function LinkedDownlink(channel, hostUri, nodeUri, laneUri, options) {
  Downlink.call(this, channel, hostUri, nodeUri, laneUri, options);
}
LinkedDownlink.prototype = Object.create(Downlink.prototype);
LinkedDownlink.prototype.constructor = LinkedDownlink;
Object.defineProperty(LinkedDownlink.prototype, 'onChannelConnect', {
  value: function (info) {
    Downlink.prototype.onChannelConnect.call(this, info);
    var nodeUri = this.channel.unresolve(this.nodeUri);
    var request = new proto.LinkRequest(nodeUri, this.laneUri, this.prio);
    this.onLinkRequest(request);
    this.channel.push(request);
  },
  configurable: true
});

module.exports = LinkedDownlink;