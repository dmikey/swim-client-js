'use strict';

function Scope(channel) {
    Object.defineProperty(this, 'channel', {
        value: channel
    });
    Object.defineProperty(this, 'downlinks', {
        value: [],
        configurable: true
    });
    Object.defineProperty(this, 'delegate', {
        value: this,
        enumerable: true,
        writable: true
    });
    channel.registerDelegate(this);
}

Object.defineProperty(Scope.prototype, 'isConnected', {
    get: function () {
        return this.channel.isConnected;
    },
    enumerable: true
});

Object.defineProperty(Scope.prototype, 'isAuthorized', {
    get: function () {
        return this.channel.isAuthorized;
    },
    enumerable: true
});

Object.defineProperty(Scope.prototype, 'session', {
    get: function () {
        return this.channel.session;
    },
    enumerable: true
});

Object.defineProperty(Scope.prototype, 'onChannelConnect', {
    value: function (info) {
        if (typeof this.delegate.onConnect === 'function') {
            this.onConnect(info);
        }
    },
    configurable: true
});

Object.defineProperty(Scope.prototype, 'onChannelDisconnect', {
    value: function (info) {
        if (typeof this.delegate.onDisconnect === 'function') {
            this.onDisconnect(info);
        }
    },
    configurable: true
});

Object.defineProperty(Scope.prototype, 'onChannelError', {
    value: function (info) {
        if (typeof this.delegate.onError === 'function') {
            this.onError(info);
        }
    },
    configurable: true
});

Object.defineProperty(Scope.prototype, 'onChannelAuthorize', {
    value: function (info) {
        if (typeof this.delegate.onAuthorize === 'function') {
            this.onAuthorize(info);
        }
    },
    configurable: true
});

Object.defineProperty(Scope.prototype, 'onChannelDeauthorize', {
    value: function (info) {
        if (typeof this.delegate.onDeauthorize === 'function') {
            this.onDeauthorize(info);
        }
    },
    configurable: true
});

Scope.prototype.registerDownlink = function (downlink) {
    var scope = this;
    Object.defineProperty(downlink, 'onChannelClose', {
        value: function () {
            scope.unregisterDownlink(downlink);
            downlink.__proto__.onChannelClose.call(downlink);
        },
        configurable: true
    });
    this.downlinks.push(downlink);
};

Scope.prototype.unregisterDownlink = function (downlink) {
    for (var i = 0, n = this.downlinks.length; i < n; i += 1) {
        if (downlink === this.downlinks[i]) {
            this.downlinks.splice(i, 1);
            return;
        }
    }
};

Scope.prototype.close = function () {
    this.channel.unregisterDelegate(this);
    var downlinks = this.downlinks;
    Object.defineProperty(this, 'downlinks', {
        value: [],
        configurable: true
    });
    for (var i = 0, n = downlinks.length; i < n; i += 1) {
        var downlink = downlinks[i];
        downlink.close();
    }
};

module.exports = Scope;