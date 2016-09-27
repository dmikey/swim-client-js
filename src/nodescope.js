'use strict';

var LaneScope = require('./lanescope');
var DownlinkBuilder = require('./downlinkbuilder');
var Scope = require('./scope');


function NodeScope(channel, hostUri, nodeUri) {
    Scope.call(this, channel);
    Object.defineProperty(this, 'hostUri', {
        value: hostUri,
        enumerable: true
    });
    Object.defineProperty(this, 'nodeUri', {
        value: nodeUri,
        enumerable: true
    });
    Object.defineProperty(this, 'downlinks', {
        value: [],
        configurable: true
    });
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

module.exports = NodeScope;