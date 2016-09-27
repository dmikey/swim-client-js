'use strict';

var Scope = require('./scope');
var DownlinkBuilder = require('./downlinkbuilder');

function LaneScope(channel, hostUri, nodeUri, laneUri) {
  Scope.call(this, channel);
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

module.exports = LaneScope;