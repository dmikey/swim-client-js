'use strict';

var HttpSocketChannel = require('./httpsocketchannel');
var WebSocketChannel = require('./websocketchannel');
var DownlinkBuilder = require('./downlinkbuilder');
var HostScope = require('./hostscope');
var NodeScope = require('./nodescope');
var LaneScope = require('./lanescope');

function Client(options) {
    options = options || {};
    Object.defineProperty(this, 'options', {
        value: options,
        enumerable: true
    });
    Object.defineProperty(this, 'channels', {
        value: {},
        configurable: true
    });
    Object.defineProperty(this, 'delegate', {
        value: this,
        enumerable: true,
        writable: true
    });
}

Object.defineProperty(Client.prototype, 'onChannelConnect', {
    value: function (info) {
        if (typeof this.delegate.onConnect === 'function') {
            this.onConnect(info);
        }
    },
    configurable: true
});

Object.defineProperty(Client.prototype, 'onChannelDisconnect', {
    value: function (info) {
        if (typeof this.delegate.onDisconnect === 'function') {
            this.onDisconnect(info);
        }
    },
    configurable: true
});

Object.defineProperty(Client.prototype, 'onChannelError', {
    value: function (info) {
        if (typeof this.delegate.onError === 'function') {
            this.onError(info);
        }
    },
    configurable: true
});

Object.defineProperty(Client.prototype, 'onChannelAuthorize', {
    value: function (info) {
        if (typeof this.delegate.onAuthorize === 'function') {
            this.onAuthorize(info);
        }
    },
    configurable: true
});

Object.defineProperty(Client.prototype, 'onChannelDeauthorize', {
    value: function (info) {
        if (typeof this.delegate.onDeauthorize === 'function') {
            this.onDeauthorize(info);
        }
    },
    configurable: true
});

Object.defineProperty(Client.prototype, 'callChannelWithLinkArgs', {
    value: function (name, args) {
        var hostUri, nodeUri, laneUri, options;
        if (args.length === 2) {
            options = {};
            laneUri = args[1];
            nodeUri = args[0];
            hostUri = Client.extractHostUri(nodeUri);
        } else if (args.length === 3) {
            if (typeof args[2] === 'object') {
                options = args[2];
                laneUri = args[1];
                nodeUri = args[0];
                hostUri = Client.extractHostUri(nodeUri);
            } else {
                hostUri = args[0];
                nodeUri = Client.resolveNodeUri(hostUri, args[1]);
                laneUri = args[2];
                options = {};
            }
        } else {
            hostUri = args[0];
            nodeUri = Client.resolveNodeUri(hostUri, args[1]);
            laneUri = args[2];
            options = args[3];
        }
        var channel = this.getOrCreateChannel(hostUri);
        return channel[name](nodeUri, laneUri, options);
    },
    configurable: true
});

Client.prototype.getOrCreateChannel = function (hostUri) {
    var channel = this.channels[hostUri];
    if (channel === undefined) {
        if (this.options.noWebSocket || /^http/.test(hostUri)) {
            channel = new HttpSocketChannel(this, hostUri, this.options);
        } else {
            channel = new WebSocketChannel(this, hostUri, this.options);
        }
        this.channels[hostUri] = channel;
    }
    return channel;
};

Client.prototype.authorize = function (hostUri, credentials) {
    var channel = this.getOrCreateChannel(hostUri);
    channel.authorize(credentials);
};

Client.prototype.downlink = function () {
    return new DownlinkBuilder(null, this);
};

Client.prototype.link = function () {
    return this.callChannelWithLinkArgs('link', arguments);
};

Client.prototype.sync = function () {
    return this.callChannelWithLinkArgs('sync', arguments);
};

Client.prototype.syncList = function () {
    return this.callChannelWithLinkArgs('syncList', arguments);
};

Client.prototype.syncMap = function () {
    return this.callChannelWithLinkArgs('syncMap', arguments);
};

Client.prototype.command = function () {
    var hostUri, nodeUri, laneUri, body;
    if (arguments.length === 3) {
        body = arguments[2];
        laneUri = arguments[1];
        nodeUri = arguments[0];
        hostUri = Client.extractHostUri(nodeUri);
    } else {
        hostUri = arguments[0];
        nodeUri = Client.resolveNodeUri(hostUri, arguments[1]);
        laneUri = arguments[2];
        body = arguments[3];
    }
    var channel = this.getOrCreateChannel(hostUri);
    channel.command(nodeUri, laneUri, body);
};

Client.prototype.host = function (hostUri) {
    var channel = this.getOrCreateChannel(hostUri);
    return new HostScope(channel, hostUri);
};

Client.prototype.node = function () {
    var hostUri, nodeUri;
    if (arguments.length === 1) {
        nodeUri = arguments[0];
        hostUri = Client.extractHostUri(nodeUri);
    } else {
        hostUri = arguments[0];
        nodeUri = Client.resolveNodeUri(hostUri, arguments[1]);
    }
    var channel = this.getOrCreateChannel(hostUri);
    return new NodeScope(channel, hostUri, nodeUri);
};

Client.prototype.lane = function () {
    var hostUri, nodeUri, laneUri;
    if (arguments.length === 2) {
        laneUri = arguments[1];
        nodeUri = arguments[0];
        hostUri = Client.extractHostUri(nodeUri);
    } else {
        hostUri = arguments[0];
        nodeUri = Client.resolveNodeUri(hostUri, arguments[1]);
        laneUri = arguments[2];
    }
    var channel = this.getOrCreateChannel(hostUri);
    return new LaneScope(channel, hostUri, nodeUri, laneUri);
};

Client.prototype.close = function () {
    var channels = this.channels;
    Object.defineProperty(this, 'channels', {
        value: {},
        configurable: true
    });
    for (var hostUri in channels) {
        var channel = channels[hostUri];
        channel.close();
    }
};

Client.extractHostUri = require('./utility').extractHostUri;
Client.resolveNodeUri = require('./utility').resolveNodeUri;

module.exports = Client;