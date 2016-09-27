'use strict';

var recon = require('recon-js');

function UriCache(baseUri, size) {
    size = size || 32;
    Object.defineProperty(this, 'baseUri', {
        value: baseUri,
        enumerable: true
    });
    Object.defineProperty(this, 'base', {
        value: recon.uri.parse(baseUri)
    });
    Object.defineProperty(this, 'size', {
        value: size,
        enumerable: true
    });
    Object.defineProperty(this, 'resolveCache', {
        value: new Array(size)
    });
    Object.defineProperty(this, 'unresolveCache', {
        value: new Array(size)
    });
}

UriCache.prototype.resolve = function (unresolvedUri) {
    var hashBucket = Math.abs(UriCache.hash(unresolvedUri) % this.size);
    var cacheEntry = this.resolveCache[hashBucket];
    if (cacheEntry && cacheEntry.unresolved === unresolvedUri) {
        return cacheEntry.resolved;
    } else {
        var resolvedUri = recon.uri.stringify(recon.uri.resolve(this.base, unresolvedUri));
        this.resolveCache[hashBucket] = {
            unresolved: unresolvedUri,
            resolved: resolvedUri
        };
        return resolvedUri;
    }
};

UriCache.prototype.unresolve = function (resolvedUri) {
    var hashBucket = Math.abs(UriCache.hash(resolvedUri) % this.size);
    var cacheEntry = this.unresolveCache[hashBucket];
    if (cacheEntry && cacheEntry.resolved === resolvedUri) {
        return cacheEntry.unresolved;
    } else {
        var unresolvedUri = recon.uri.stringify(recon.uri.unresolve(this.base, resolvedUri));
        this.unresolveCache[hashBucket] = {
            unresolved: unresolvedUri,
            resolved: resolvedUri
        };
        return unresolvedUri;
    }
};

UriCache.rotl = function (value, distance) {
    return (value << distance) | (value >>> (32 - distance));
};

UriCache.mix = function (code, value) {
    // MurmurHash3 mix function
    value *= 0xcc9e2d51;
    value = UriCache.rotl(value, 15);
    value *= 0x1b873593;
    code ^= value;
    code = UriCache.rotl(code, 13);
    code = code * 5 + 0xe6546b64;
    return code;
};

UriCache.mash = function (code) {
    // MurmurHash3 finalize function
    code ^= code >>> 16;
    code *= 0x85ebca6b;
    code ^= code >>> 13;
    code *= 0xc2b2ae35;
    code ^= code >>> 16;
    return code;
};

UriCache.hash = function (string) {
    var code = 0;
    for (var i = 0, n = string.length; i < n; i += 1) {
        code = UriCache.mix(code, string.charAt(i));
    }
    code = UriCache.mash(code);
    return code;
};

module.exports = UriCache;