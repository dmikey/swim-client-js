'use strict';

var recon = require('recon-js');

// breaks circular references, shared functions here
module.exports = {
    extractHostUri: function (nodeUri) {
        var uri = recon.uri.parse(nodeUri);
        var scheme = uri.scheme;
        if (scheme === 'swim') scheme = 'ws';
        else if (scheme === 'swims') scheme = 'wss';
        return recon.uri.stringify({
            scheme: scheme,
            authority: uri.authority
        });
    },
    resolveNodeUri: function (hostUri, nodeUri) {
        return recon.uri.stringify(recon.uri.resolve(hostUri, nodeUri));
    }
};