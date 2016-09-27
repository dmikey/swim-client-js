'use strict';

var Scope = require('./scope');
var DownlinkBuilder = require('./downlinkbuilder');
var NodeScope = require('./nodescope');
var LaneScope = require('./lanescope');
var Utility = require('./utility');

function HostScope(channel, hostUri) {
    Scope.call(this, channel);
    Object.defineProperty(this, 'hostUri', {
        value: hostUri,
        enumerable: true
    });
    Object.defineProperty(this, 'downlinks', {
        value: [],
        configurable: true
    });
}

HostScope.prototype = Object.create(Scope.prototype);

HostScope.prototype.constructor = HostScope;

HostScope.prototype.authorize = function (credentials) {
    this.channel.authorize(credentials);
};

HostScope.prototype.downlink = function () {
    return new DownlinkBuilder(this.channel, this).host(this.hostUri);
};

HostScope.prototype.link = function (nodeUri, laneUri, options) {
    var downlink = this.channel.link(Utility.resolveNodeUri(this.hostUri, nodeUri), laneUri, options);
    this.registerDownlink(downlink);
    return downlink;
};

HostScope.prototype.sync = function (nodeUri, laneUri, options) {
    var downlink = this.channel.sync(Utility.resolveNodeUri(this.hostUri, nodeUri), laneUri, options);
    this.registerDownlink(downlink);
    return downlink;
};

HostScope.prototype.syncList = function (nodeUri, laneUri, options) {
    var downlink = this.channel.syncList(Utility.resolveNodeUri(this.hostUri, nodeUri), laneUri, options);
    this.registerDownlink(downlink);
    return downlink;
};

HostScope.prototype.syncMap = function (nodeUri, laneUri, options) {
    var downlink = this.channel.syncMap(Utility.resolveNodeUri(this.hostUri, nodeUri), laneUri, options);
    this.registerDownlink(downlink);
    return downlink;
};

HostScope.prototype.command = function (nodeUri, laneUri, body) {
    this.channel.command(Utility.resolveNodeUri(this.hostUri, nodeUri), laneUri, body);
};

HostScope.prototype.node = function (nodeUri) {
    return new NodeScope(this.channel, this.hostUri, Utility.resolveNodeUri(this.hostUri, nodeUri));
};

HostScope.prototype.lane = function (nodeUri, laneUri) {
    return new LaneScope(this.channel, this.hostUri, Utility.resolveNodeUri(this.hostUri, nodeUri), laneUri);
};

module.exports = HostScope;