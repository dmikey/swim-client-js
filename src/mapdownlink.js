'use strict';

var proto = require('swim-proto-js');
var recon = require('recon-js');
var SyncedDownlink = require('./synceddownlink');

function MapDownlink(channel, hostUri, nodeUri, laneUri, options) {
    SyncedDownlink.call(this, channel, hostUri, nodeUri, laneUri, options);
    Object.defineProperty(this, 'state', {
        value: [],
        configurable: true
    });
    Object.defineProperty(this, 'table', {
        value: {},
        configurable: true
    });
    this.primaryKey = MapDownlink.primaryKeyOption(this.options);
    this.sortBy = MapDownlink.sortByOption(this.options);
}
MapDownlink.prototype = Object.create(SyncedDownlink.prototype);
MapDownlink.prototype.constructor = MapDownlink;
Object.defineProperty(MapDownlink.prototype, 'onEventMessage', {
    value: function (message) {
        var tag = recon.tag(message.body);
        var head, key, value;
        if (tag === '@update') {
            head = recon.head(message.body);
            key = recon.get(head, 'key');
            value = recon.tail(message.body);
            this.remoteSet(key, value);
        } else if (tag === '@remove' || tag === '@delete') {
            head = recon.head(message.body);
            key = recon.get(head, 'key');
            if (key === undefined && this.primaryKey) {
                key = this.primaryKey(message.body);
            }
            if (key !== undefined) {
                this.remoteDelete(key);
            }
        } else if (tag === '@clear' && recon.size(message.body) === 1) {
            this.remoteClear();
        } else if (this.primaryKey) {
            value = message.body;
            key = this.primaryKey(value);
            if (key !== undefined) {
                this.remoteSet(key, value);
            }
        }
        SyncedDownlink.prototype.onEventMessage.call(this, message);
    },
    configurable: true
});
Object.defineProperty(MapDownlink.prototype, 'remoteSet', {
    value: function (key, value) {
        Object.defineProperty(value, '$key', {
            value: key,
            configurable: true
        });
        if (typeof key === 'string') {
            this.table[key] = value;
        }
        for (var i = 0, n = this.state.length; i < n; i += 1) {
            if (recon.equal(key, this.state[i].$key)) {
                this.state[i] = value;
                break;
            }
        }
        if (i === n) {
            this.state.push(value);
        }
        this.sort();
    },
    configurable: true
});
Object.defineProperty(MapDownlink.prototype, 'remoteDelete', {
    value: function (key) {
        if (typeof key === 'string') {
            delete this.table[key];
        }
        for (var i = 0, n = this.state.length; i < n; i += 1) {
            if (recon.equal(key, this.state[i].$key)) {
                this.state.splice(i, 1);
                return;
            }
        }
    },
    configurable: true
});
Object.defineProperty(MapDownlink.prototype, 'remoteClear', {
    value: function (key) {
        Object.defineProperty(this, 'state', {
            value: [],
            configurable: true
        });
        Object.defineProperty(this, 'table', {
            value: {},
            configurable: true
        });
    },
    configurable: true
});
Object.defineProperty(MapDownlink.prototype, 'size', {
    get: function () {
        return this.state.length;
    },
    configurable: true,
    enumerable: true
});
MapDownlink.prototype.has = function (key) {
    if (typeof key === 'string') {
        return this.table[key] !== undefined;
    } else {
        for (var i = 0, n = this.state.length; i < n; i += 1) {
            if (recon.equal(key, this.state[i].$key)) {
                return true;
            }
        }
    }
    return false;
};
MapDownlink.prototype.get = function (key) {
    if (typeof key === 'string') {
        return this.table[key];
    } else {
        for (var i = 0, n = this.state.length; i < n; i += 1) {
            var value = this.state[i];
            if (recon.equal(key, value.$key)) {
                return value;
            }
        }
    }
};
MapDownlink.prototype.set = function (key, value) {
    value = recon(value !== undefined ? value : this.get(key));
    Object.defineProperty(value, '$key', {
        value: key,
        configurable: true
    });
    if (typeof key === 'string') {
        this.table[key] = value;
    }
    var oldValue;
    for (var i = 0, n = this.state.length; i < n; i += 1) {
        if (recon.equal(key, this.state[i].$key)) {
            oldValue = this.state[i];
            this.state[i] = value;
            break;
        }
    }
    if (i === n) {
        this.state.push(value);
    }
    this.sort();
    if (!recon.equal(value, oldValue)) {
        var nodeUri = this.channel.unresolve(this.nodeUri);
        var body;
        if (this.primaryKey) {
            body = recon(value);
        } else {
            body = recon.concat(recon({
                '@update': {
                    key: key
                }
            }), recon(value));
        }
        var message = new proto.CommandMessage(nodeUri, this.laneUri, body);
        this.onCommandMessage(message);
        this.channel.push(message);
    }
    return this;
};
MapDownlink.prototype.delete = function (key) {
    if (typeof key === 'string') {
        delete this.table[key];
    }
    for (var i = 0, n = this.state.length; i < n; i += 1) {
        var value = this.state[i];
        if (recon.equal(key, value.$key)) {
            this.state.splice(i, 1);
            var nodeUri = this.channel.unresolve(this.nodeUri);
            var body;
            if (this.primaryKey) {
                body = recon.concat(recon({
                    '@remove': null
                }), value);
            } else {
                body = recon({
                    '@remove': {
                        key: key
                    }
                });
            }
            var message = new proto.CommandMessage(nodeUri, this.laneUri, body);
            this.onCommandMessage(message);
            this.channel.push(message);
            return true;
        }
    }
    return false;
};
MapDownlink.prototype.clear = function () {
    Object.defineProperty(this, 'state', {
        value: [],
        configurable: true
    });
    Object.defineProperty(this, 'table', {
        value: {},
        configurable: true
    });
    var nodeUri = this.channel.unresolve(this.nodeUri);
    var message = new proto.CommandMessage(nodeUri, this.laneUri, [{
        '@clear': null
    }]);
    this.onCommandMessage(message);
    this.channel.push(message);
    return this;
};
MapDownlink.prototype.sort = function () {
    if (this.sortBy) {
        this.state.sort(this.sortBy);
    }
};
MapDownlink.prototype.keys = function () {
    var keys = [];
    for (var i = 0, n = this.state.length; i < n; i += 1) {
        var key = this.state[i].$key;
        if (key !== undefined) {
            keys.push(key);
        }
    }
    return keys;
};
MapDownlink.prototype.values = function () {
    return this.state;
};
MapDownlink.prototype.forEach = function (callback, thisArg) {
    for (var i = 0, n = this.state.length; i < n; i += 1) {
        var value = this.state[i];
        var key = value.$key;
        callback.call(thisArg, value, key, this);
    }
};
MapDownlink.primaryKeyOption = function (options) {
    if (typeof options.primaryKey === 'function') {
        return options.primaryKey;
    } else if (typeof options.primaryKey === 'string') {
        var keys = options.primaryKey.split('.');
        return function (value) {
            for (var i = 0, n = keys.length; i < n; i += 1) {
                var key = keys[i];
                value = recon.get(value, key);
            }
            return value;
        };
    } else {
        return undefined;
    }
};
MapDownlink.sortByOption = function (options) {
    if (typeof options.sortBy === 'function') {
        return options.sortBy;
    } else if (typeof options.sortBy === 'string') {
        var keys = options.sortBy.split('.');
        return function (x, y) {
            for (var i = 0, n = keys.length; i < n; i += 1) {
                var key = keys[i];
                x = recon.get(x, key);
                y = recon.get(y, key);
                return recon.compare(x, y);
            }
        };
    }
};

module.exports = MapDownlink;