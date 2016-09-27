'use strict';

var Utility = require('./utility');
var LinkedDownlink = require('./linkeddownlink');
var SyncedDownlink = require('./synceddownlink');
var ListDownlink = require('./listdownlink');
var MapDownlink = require('./mapdownlink');

function DownlinkBuilder(channel, scope) {
    Object.defineProperty(this, 'channel', {
        value: channel,
        configurable: true
    });
    Object.defineProperty(this, 'scope', {
        value: scope,
        configurable: true
    });
    Object.defineProperty(this, 'proxy', {
        value: {},
        configurable: true
    });
    this.options = {};
}

DownlinkBuilder.prototype.host = function (hostUri) {
    if (!arguments.length) return this.hostUri;
    this.hostUri = hostUri;
    return this;
};

DownlinkBuilder.prototype.node = function (nodeUri) {
    if (!arguments.length) return this.nodeUri;
    this.nodeUri = nodeUri;
    return this;
};

DownlinkBuilder.prototype.lane = function (laneUri) {
    if (!arguments.length) return this.laneUri;
    this.laneUri = laneUri;
    return this;
};

DownlinkBuilder.prototype.prio = function (prio) {
    if (!arguments.length) return this.options.prio;
    this.options.prio = prio;
    return this;
};

DownlinkBuilder.prototype.keepAlive = function (keepAlive) {
    if (!arguments.length) return this.options.keepAlive;
    this.options.keepAlive = keepAlive;
    return this;
};

DownlinkBuilder.prototype.delegate = function (delegate) {
    if (!arguments.length) return this.options.delegate;
    this.options.delegate = delegate;
    return this;
};

DownlinkBuilder.prototype.onEvent = function (callback) {
    if (!arguments.length) return this.proxy.onEvent;
    this.proxy.onEvent = callback;
    return this;
};

DownlinkBuilder.prototype.onCommand = function (callback) {
    if (!arguments.length) return this.proxy.onCommand;
    this.proxy.onCommand = callback;
    return this;
};

DownlinkBuilder.prototype.onLink = function (callback) {
    if (!arguments.length) return this.proxy.onLink;
    this.proxy.onLink = callback;
    return this;
};

DownlinkBuilder.prototype.onLinked = function (callback) {
    if (!arguments.length) return this.proxy.onLinked;
    this.proxy.onLinked = callback;
    return this;
};

DownlinkBuilder.prototype.onSync = function (callback) {
    if (!arguments.length) return this.proxy.onSync;
    this.proxy.onSync = callback;
    return this;
};

DownlinkBuilder.prototype.onSynced = function (callback) {
    if (!arguments.length) return this.proxy.onSynced;
    this.proxy.onSynced = callback;
    return this;
};

DownlinkBuilder.prototype.onUnlink = function (callback) {
    if (!arguments.length) return this.proxy.onUnlink;
    this.proxy.onUnlink = callback;
    return this;
};

DownlinkBuilder.prototype.onUnlinked = function (callback) {
    if (!arguments.length) return this.proxy.onUnlinked;
    this.proxy.onUnlinked = callback;
    return this;
};

DownlinkBuilder.prototype.onConnect = function (callback) {
    if (!arguments.length) return this.proxy.onConnect;
    this.proxy.onConnect = callback;
    return this;
};

DownlinkBuilder.prototype.onDisconnect = function (callback) {
    if (!arguments.length) return this.proxy.onDisconnect;
    this.proxy.onDisconnect = callback;
    return this;
};

DownlinkBuilder.prototype.onError = function (callback) {
    if (!arguments.length) return this.proxy.onError;
    this.proxy.onError = callback;
    return this;
};

DownlinkBuilder.prototype.onClose = function (callback) {
    if (!arguments.length) return this.proxy.onClose;
    this.proxy.onClose = callback;
    return this;
};

DownlinkBuilder.prototype.primaryKey = function (primaryKey) {
    if (!arguments.length) return this.options.primaryKey;
    this.options.primaryKey = primaryKey;
    return this;
};

DownlinkBuilder.prototype.sortBy = function (sortBy) {
    if (!arguments.length) return this.options.sortBy;
    this.options.sortBy = sortBy;
    return this;
};

Object.defineProperty(DownlinkBuilder.prototype, 'normalize', {
    value: function () {

        if (this.hostUri) {
            this.nodeUri = Utility.resolveNodeUri(this.hostUri, this.nodeUri);
        } else {
            this.hostUri = Utility.extractHostUri(this.nodeUri);
        }
        if (!this.channel) {
            // If channel is null then scope references a Client.
            Object.defineProperty(this, 'channel', {
                value: this.scope.getOrCreateChannel(this.hostUri),
                configurable: true
            });
            Object.defineProperty(this, 'scope', {
                value: null,
                configurable: true
            });
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

module.exports = DownlinkBuilder;