'use strict';
/* global describe: false */
/* global it: false */
/* global beforeEach: false */
/* global afterEach: false */

var assert = require('assert');
var http = require('http');
var WebSocket = require('websocket');
var recon = require('recon-js');
var proto = require('swim-proto-js');
var swim = require('./swim-client.js');

assert.same = function (x, y) {
  if (!recon.equal(x, y)) {
    assert.fail(false, true, recon.stringify(x) + ' did not equal ' + recon.stringify(y));
  }
};

function resolve(base, relative) {
  return recon.uri.stringify(recon.uri.resolve(base, relative));
}


describe('Swim Client', function () {
  this.timeout(5000);
  this.slow(5000);

  var httpServer, wsServer, connection, socket, client;
  var hostUri = 'http://localhost:8009';

  beforeEach(function (done) {
    httpServer = http.createServer();
    httpServer.listen(8009, function () {
      done();
    });
    wsServer = new WebSocket.server({
      httpServer: httpServer
    });
    socket = {};
    client = swim.client();
    wsServer.on('request', function (request) {
      var connection = request.accept(request.origin);
      connection.on('message', function (frame) {
        var envelope = proto.parse(frame.utf8Data);
        socket.receive(envelope);
      });
      socket.send = function (envelope) {
        var payload = proto.stringify(envelope);
        connection.sendUTF(payload);
      };
      socket.sendText = function (string) {
        connection.sendUTF(string);
      };
      socket.sendBytes = function (buffer) {
        connection.sendBytes(buffer);
      };
      socket.close = function () {
        connection.close();
        connection = undefined;
      };
    });
  });

  afterEach(function (done) {
    if (client) client.close();
    if (connection) connection.close();
    wsServer.shutDown();
    httpServer.close(function () {
      client = undefined;
      socket = undefined;
      connection = undefined;
      wsServer = undefined;
      httpServer = undefined;
      done();
    });
  });


  it('should create a link through a client scope', function () {
    var options = {prio: 0.5};
    var downlink = client.link(hostUri, 'house/kitchen#light', 'light/on', options);
    assert.equal(downlink.hostUri, hostUri);
    assert.equal(downlink.nodeUri, resolve(hostUri, 'house/kitchen#light'));
    assert.equal(downlink.laneUri, 'light/on');
    assert.equal(downlink.prio, 0.5);
    assert(!downlink.keepAlive);
    assert.equal(downlink.options, options);
    assert.equal(downlink.delegate, downlink);
  });

  it('should create a synchronized link through a client scope', function () {
    var options = {prio: 0.5};
    var downlink = client.sync(hostUri, 'house/kitchen#light', 'light/on', options);
    assert.equal(downlink.hostUri, hostUri);
    assert.equal(downlink.nodeUri, resolve(hostUri, 'house/kitchen#light'));
    assert.equal(downlink.laneUri, 'light/on');
    assert.equal(downlink.prio, 0.5);
    assert(!downlink.keepAlive);
    assert.equal(downlink.options, options);
    assert.equal(downlink.delegate, downlink);

    downlink = client.sync(resolve(hostUri, 'house/kitchen#light'), 'light/on', options);
    assert.equal(downlink.hostUri, hostUri);
    assert.equal(downlink.nodeUri, resolve(hostUri, 'house/kitchen#light'));
    assert.equal(downlink.laneUri, 'light/on');
    assert.equal(downlink.prio, 0.5);
    assert(!downlink.keepAlive);
    assert.equal(downlink.options, options);
    assert.equal(downlink.delegate, downlink);
  });

  it('should link a lane through a client scope', function (done) {
    var nodeUri = resolve(hostUri, 'house/kitchen#light');
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var downlink = client.link(nodeUri, 'light/on');
    var linkCount = 0;
    downlink.onLink = function (request) {
      linkCount += 1;
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
    };
    downlink.onLinked = function (response) {
      assert.equal(linkCount, 1);
      assert.equal(response.node, nodeUri);
      assert.equal(response.lane, 'light/on');
      done();
    };
  });

  it('should receive an event from a link through a client scope', function (done) {
    var nodeUri = resolve(hostUri, 'house/kitchen#light');
    var body = recon.parse('@switch { level: 100 }');
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
      socket.send(new proto.EventMessage('house/kitchen#light', 'light/on', body));
    };
    var downlink = client.link(nodeUri, 'light/on');
    downlink.onEvent = function (message) {
      assert.equal(message.node, nodeUri);
      assert.equal(message.lane, 'light/on');
      assert.same(message.body, body);
      done();
    };
  });

  it('should sync a lane through a client scope', function (done) {
    var nodeUri = resolve(hostUri, 'house/kitchen#light');
    var body = recon.parse('@switch { level: 100 }');
    socket.receive = function (request) {
      assert(request.isSyncRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
      socket.send(new proto.EventMessage('house/kitchen#light', 'light/on', body));
      socket.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var downlink = client.sync(nodeUri, 'light/on');
    var state = 0;
    downlink.onSync = function (request) {
      assert.equal(state, 0);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      state = 1;
    };
    downlink.onEvent = function (response) {
      assert.equal(state, 1);
      assert.equal(response.node, nodeUri);
      assert.equal(response.lane, 'light/on');
      assert.same(response.body, body);
      state = 2;
    };
    downlink.onSynced = function (response) {
      assert.equal(response.node, nodeUri);
      assert.equal(response.lane, 'light/on');
      assert.equal(state, 2);
      done();
    };
  });

  it('should unlink a lane through a client scope', function (done) {
    socket.receive = function (request) {
      if (request.isLinkRequest) {
        socket.send(new proto.LinkedResponse(request.node, request.lane));
      } else if (request.isUnlinkRequest) {
        socket.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var downlink = client.link(resolve(hostUri, 'house/kitchen#light'), 'light/on');
    downlink.onLinked = function (response) {
      downlink.close();
    };
    downlink.onUnlink = function (request) {
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      done();
    };
  });

  it('should command a lane through a client scope', function (done) {
    var body = recon.parse('@switch { level: 0 }');
    socket.receive = function (message) {
      assert(message.isCommandMessage);
      assert.equal(message.node, 'house');
      assert.equal(message.lane, 'light/off');
      assert.same(message.body, body);
      done();
    };
    client.command(resolve(hostUri, 'house'), 'light/off', body);
  });

  it('should link a meta lane through a client scope', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var downlink = client.link(hostUri, 'swim:meta:router', 'gateway/info');
    var linkCount = 0;
    downlink.onLink = function (request) {
      linkCount += 1;
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
    };
    downlink.onLinked = function (response) {
      assert.equal(linkCount, 1);
      assert.equal(response.node, 'swim:meta:router');
      assert.equal(response.lane, 'gateway/info');
      done();
    };
  });

  it('should receive an event from a meta link through a client scope', function (done) {
    var body = recon.parse('@gateway');
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
      socket.send(new proto.EventMessage('swim:meta:router', 'gateway/info', body));
    };
    var downlink = client.link(hostUri, 'swim:meta:router', 'gateway/info');
    downlink.onEvent = function (message) {
      assert.equal(message.node, 'swim:meta:router');
      assert.equal(message.lane, 'gateway/info');
      assert.same(message.body, body);
      done();
    };
  });

  it('should sync a meta lane through a client scope', function (done) {
    var body = recon.parse('@gateway');
    socket.receive = function (request) {
      assert(request.isSyncRequest);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
      socket.send(new proto.EventMessage('swim:meta:router', 'gateway/info', body));
      socket.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var downlink = client.sync(hostUri, 'swim:meta:router', 'gateway/info');
    var state = 0;
    downlink.onSync = function (request) {
      assert.equal(state, 0);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      state = 1;
    };
    downlink.onEvent = function (response) {
      assert.equal(state, 1);
      assert.equal(response.node, 'swim:meta:router');
      assert.equal(response.lane, 'gateway/info');
      assert.same(response.body, body);
      state = 2;
    };
    downlink.onSynced = function (response) {
      assert.equal(response.node, 'swim:meta:router');
      assert.equal(response.lane, 'gateway/info');
      assert.equal(state, 2);
      done();
    };
  });

  it('should unlink a meta lane through a client scope', function (done) {
    socket.receive = function (request) {
      if (request.isLinkRequest) {
        socket.send(new proto.LinkedResponse(request.node, request.lane));
      } else if (request.isUnlinkRequest) {
        socket.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var downlink = client.link(hostUri, 'swim:meta:router', 'gateway/info');
    downlink.onLinked = function (response) {
      downlink.close();
    };
    downlink.onUnlink = function (request) {
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      done();
    };
  });

  it('should command a meta lane through a client scope', function (done) {
    var body = recon.parse('@gateway');
    socket.receive = function (message) {
      assert(message.isCommandMessage);
      assert.equal(message.node, 'swim:meta:router');
      assert.equal(message.lane, 'gateway/info');
      assert.same(message.body, body);
      done();
    };
    client.command(hostUri, 'swim:meta:router', 'gateway/info', body);
  });


  it('should create a host scope from a client scope', function () {
    var host = client.host(hostUri);
    assert.equal(host.hostUri, hostUri);
  });

  it('should link a lane through a host scope', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var host = client.host(hostUri);
    var downlink = host.link('house/kitchen#light', 'light/on');
    var linkCount = 0;
    downlink.onLink = function (request) {
      linkCount += 1;
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
    };
    downlink.onLinked = function (response) {
      assert.equal(linkCount, 1);
      assert.equal(response.node, resolve(hostUri, 'house/kitchen#light'));
      assert.equal(response.lane, 'light/on');
      done();
    };
  });

  it('should sync a lane through a host scope', function (done) {
    var nodeUri = resolve(hostUri, 'house/kitchen#light');
    var body = recon.parse('@switch { level: 100 }');
    socket.receive = function (request) {
      assert(request.isSyncRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
      socket.send(new proto.EventMessage('house/kitchen#light', 'light/on', body));
      socket.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var host = client.host(hostUri);
    var downlink = host.sync('house/kitchen#light', 'light/on');
    var state = 0;
    downlink.onSync = function (request) {
      assert.equal(state, 0);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      state = 1;
    };
    downlink.onEvent = function (response) {
      assert.equal(state, 1);
      assert.equal(response.node, nodeUri);
      assert.equal(response.lane, 'light/on');
      assert.same(response.body, body);
      state = 2;
    };
    downlink.onSynced = function (response) {
      assert.equal(response.node, nodeUri);
      assert.equal(response.lane, 'light/on');
      assert.equal(state, 2);
      done();
    };
  });

  it('should unlink a lane through a host scope', function (done) {
    socket.receive = function (request) {
      if (request.isLinkRequest) {
        socket.send(new proto.LinkedResponse(request.node, request.lane));
      } else if (request.isUnlinkRequest) {
        socket.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var host = client.host(hostUri);
    var downlink = host.link('house/kitchen#light', 'light/on');
    downlink.onLinked = function (response) {
      downlink.close();
    };
    downlink.onUnlink = function (request) {
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      done();
    };
  });

  it('should command a lane through a host scope', function (done) {
    var body = recon.parse('@switch { level: 0 }');
    socket.receive = function (message) {
      assert(message.isCommandMessage);
      assert.equal(message.node, 'house');
      assert.equal(message.lane, 'light/off');
      assert.same(message.body, body);
      done();
    };
    var host = client.host(hostUri);
    host.command('house', 'light/off', body);
  });

  it('should link a meta lane through a host scope', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var host = client.host(hostUri);
    var downlink = host.link('swim:meta:router', 'gateway/info');
    var linkCount = 0;
    downlink.onLink = function (request) {
      linkCount += 1;
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
    };
    downlink.onLinked = function (response) {
      assert.equal(linkCount, 1);
      assert.equal(response.node, 'swim:meta:router');
      assert.equal(response.lane, 'gateway/info');
      done();
    };
  });

  it('should sync a meta lane through a host scope', function (done) {
    var nodeUri = resolve(hostUri, 'swim:meta:router');
    var body = recon.parse('@gateway');
    socket.receive = function (request) {
      assert(request.isSyncRequest);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
      socket.send(new proto.EventMessage('swim:meta:router', 'gateway/info', body));
      socket.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var host = client.host(hostUri);
    var downlink = host.sync('swim:meta:router', 'gateway/info');
    var state = 0;
    downlink.onSync = function (request) {
      assert.equal(state, 0);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      state = 1;
    };
    downlink.onEvent = function (response) {
      assert.equal(state, 1);
      assert.equal(response.node, nodeUri);
      assert.equal(response.lane, 'gateway/info');
      assert.same(response.body, body);
      state = 2;
    };
    downlink.onSynced = function (response) {
      assert.equal(response.node, nodeUri);
      assert.equal(response.lane, 'gateway/info');
      assert.equal(state, 2);
      done();
    };
  });

  it('should unlink a meta lane through a host scope', function (done) {
    socket.receive = function (request) {
      if (request.isLinkRequest) {
        socket.send(new proto.LinkedResponse(request.node, request.lane));
      } else if (request.isUnlinkRequest) {
        socket.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var host = client.host(hostUri);
    var downlink = host.link('swim:meta:router', 'gateway/info');
    downlink.onLinked = function (response) {
      downlink.close();
    };
    downlink.onUnlink = function (request) {
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      done();
    };
  });

  it('should command a meta lane through a host scope', function (done) {
    var body = recon.parse('@gateway');
    socket.receive = function (message) {
      assert(message.isCommandMessage);
      assert.equal(message.node, 'swim:meta:router');
      assert.equal(message.lane, 'gateway/info');
      assert.same(message.body, body);
      done();
    };
    var host = client.host(hostUri);
    host.command('swim:meta:router', 'gateway/info', body);
  });

  it('should close all member links when a host scope closes', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      socket.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var host = client.host(hostUri);
    var linkCount = 0;
    var closeCount = 0;
    function onLink(request) {
      linkCount += 1;
      if (linkCount === 2) host.close();
    }
    function onClose() {
      closeCount += 1;
      if (closeCount === 2) done();
    }
    var downlink1 = host.link('house/kitchen#light', 'light/on');
    downlink1.onLink = onLink;
    downlink1.onClose = onClose;
    var downlink2 = host.link('swim:meta:router', 'gateway/info');
    downlink2.onLink = onLink;
    downlink2.onClose = onClose;
  });


  it('should create a node scope from a client scope', function () {
    var nodeUri = resolve(hostUri, 'house/kitchen#light');
    var node1 = client.node(hostUri, 'house/kitchen#light');
    var node2 = client.node(nodeUri);
    assert.equal(node1.hostUri, hostUri);
    assert.equal(node1.nodeUri, nodeUri);
    assert.equal(node2.hostUri, hostUri);
    assert.equal(node2.nodeUri, nodeUri);
  });

  it('should create a node scope from a host scope', function () {
    var nodeUri = resolve(hostUri, 'house/kitchen#light');
    var host = client.host(hostUri);
    var node = host.node('house/kitchen#light');
    assert.equal(node.hostUri, hostUri);
    assert.equal(node.nodeUri, nodeUri);
  });

  it('should rewrite swim URI schemes in host URIs extracted from node URIs', function () {
    var node1 = client.node('swim://example.com/');
    assert.equal(node1.hostUri, 'ws://example.com');
    var node2 = client.node('swims://example.com/');
    assert.equal(node2.hostUri, 'wss://example.com');
  });

  it('should link a lane through a node scope', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var node = client.node(hostUri, 'house/kitchen#light');
    var downlink = node.link('light/on');
    var linkCount = 0;
    downlink.onLink = function (request) {
      linkCount += 1;
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
    };
    downlink.onLinked = function (response) {
      assert.equal(linkCount, 1);
      assert.equal(response.node, resolve(hostUri, 'house/kitchen#light'));
      assert.equal(response.lane, 'light/on');
      done();
    };
  });

  it('should sync a lane through a node scope', function (done) {
    var nodeUri = resolve(hostUri, 'house/kitchen#light');
    var body = recon.parse('@switch { level: 100 }');
    socket.receive = function (request) {
      assert(request.isSyncRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
      socket.send(new proto.EventMessage('house/kitchen#light', 'light/on', body));
      socket.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var node = client.node(hostUri, 'house/kitchen#light');
    var downlink = node.sync('light/on');
    var state = 0;
    downlink.onSync = function (request) {
      assert.equal(state, 0);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      state = 1;
    };
    downlink.onEvent = function (response) {
      assert.equal(state, 1);
      assert.equal(response.node, nodeUri);
      assert.equal(response.lane, 'light/on');
      assert.same(response.body, body);
      state = 2;
    };
    downlink.onSynced = function (response) {
      assert.equal(response.node, nodeUri);
      assert.equal(response.lane, 'light/on');
      assert.equal(state, 2);
      done();
    };
  });

  it('should unlink a lane through a node scope', function (done) {
    socket.receive = function (request) {
      if (request.isLinkRequest) {
        socket.send(new proto.LinkedResponse(request.node, request.lane));
      } else if (request.isUnlinkRequest) {
        socket.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var node = client.node(hostUri, 'house/kitchen#light');
    var downlink = node.link('light/on');
    downlink.onLinked = function (response) {
      downlink.close();
    };
    downlink.onUnlink = function (request) {
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      done();
    };
  });

  it('should command a lane through a node scope', function (done) {
    var body = recon.parse('@switch { level: 0 }');
    socket.receive = function (message) {
      assert(message.isCommandMessage);
      assert.equal(message.node, 'house');
      assert.equal(message.lane, 'light/off');
      assert.same(message.body, body);
      done();
    };
    var node = client.node(hostUri, 'house');
    node.command('light/off', body);
  });

  it('should link a lane through a meta node scope', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var node = client.node(hostUri, 'swim:meta:router');
    var downlink = node.link('gateway/info');
    var linkCount = 0;
    downlink.onLink = function (request) {
      linkCount += 1;
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
    };
    downlink.onLinked = function (response) {
      assert.equal(linkCount, 1);
      assert.equal(response.node, 'swim:meta:router');
      assert.equal(response.lane, 'gateway/info');
      done();
    };
  });

  it('should sync a lane through a meta node scope', function (done) {
    var nodeUri = resolve(hostUri, 'swim:meta:router');
    var body = recon.parse('@gateway');
    socket.receive = function (request) {
      assert(request.isSyncRequest);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
      socket.send(new proto.EventMessage('swim:meta:router', 'gateway/info', body));
      socket.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var node = client.node(hostUri, 'swim:meta:router');
    var downlink = node.sync('gateway/info');
    var state = 0;
    downlink.onSync = function (request) {
      assert.equal(state, 0);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      state = 1;
    };
    downlink.onEvent = function (response) {
      assert.equal(state, 1);
      assert.equal(response.node, nodeUri);
      assert.equal(response.lane, 'gateway/info');
      assert.same(response.body, body);
      state = 2;
    };
    downlink.onSynced = function (response) {
      assert.equal(response.node, nodeUri);
      assert.equal(response.lane, 'gateway/info');
      assert.equal(state, 2);
      done();
    };
  });

  it('should unlink a lane through a meta node scope', function (done) {
    socket.receive = function (request) {
      if (request.isLinkRequest) {
        socket.send(new proto.LinkedResponse(request.node, request.lane));
      } else if (request.isUnlinkRequest) {
        socket.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var node = client.node(hostUri, 'swim:meta:router');
    var downlink = node.link('gateway/info');
    downlink.onLinked = function (response) {
      downlink.close();
    };
    downlink.onUnlink = function (request) {
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      done();
    };
  });

  it('should command a lane through a meta node scope', function (done) {
    var body = recon.parse('@gateway');
    socket.receive = function (message) {
      assert(message.isCommandMessage);
      assert.equal(message.node, 'swim:meta:router');
      assert.equal(message.lane, 'gateway/info');
      assert.same(message.body, body);
      done();
    };
    var node = client.node(hostUri, 'swim:meta:router');
    node.command('gateway/info', body);
  });

  it('should close all member links when a node scope closes', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      socket.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var node = client.node(hostUri, 'house/kitchen#light');
    var linkCount = 0;
    var closeCount = 0;
    function onLink(request) {
      linkCount += 1;
      if (linkCount === 2) node.close();
    }
    function onClose() {
      closeCount += 1;
      if (closeCount === 2) done();
    }
    var downlink1 = node.link('light/on');
    downlink1.onLink = onLink;
    downlink1.onClose = onClose;
    var downlink2 = node.link('lgith/off');
    downlink2.onLink = onLink;
    downlink2.onClose = onClose;
  });


  it('should create a lane scope from a client scope', function () {
    var nodeUri = resolve(hostUri, 'house/kitchen#light');
    var lane1 = client.lane(hostUri, 'house/kitchen#light', 'light/on');
    var lane2 = client.lane(nodeUri, 'light/on');
    assert.equal(lane1.hostUri, hostUri);
    assert.equal(lane1.nodeUri, nodeUri);
    assert.equal(lane1.laneUri, 'light/on');
    assert.equal(lane2.hostUri, hostUri);
    assert.equal(lane2.nodeUri, nodeUri);
    assert.equal(lane2.laneUri, 'light/on');
  });

  it('should create a lane scope from a host scope', function () {
    var nodeUri = resolve(hostUri, 'house/kitchen#light');
    var host = client.host(hostUri);
    var lane = host.lane('house/kitchen#light', 'light/on');
    assert.equal(lane.hostUri, hostUri);
    assert.equal(lane.nodeUri, nodeUri);
    assert.equal(lane.laneUri, 'light/on');
  });

  it('should create a lane scope from a node scope', function () {
    var nodeUri = resolve(hostUri, 'house/kitchen#light');
    var node = client.node(nodeUri);
    var lane = node.lane('light/on');
    assert.equal(lane.hostUri, hostUri);
    assert.equal(lane.nodeUri, nodeUri);
    assert.equal(lane.laneUri, 'light/on');
  });

  it('should link a lane through a lane scope', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var lane = client.lane(hostUri, 'house/kitchen#light', 'light/on');
    var downlink = lane.link();
    var linkCount = 0;
    downlink.onLink = function (request) {
      linkCount += 1;
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
    };
    downlink.onLinked = function (response) {
      assert.equal(linkCount, 1);
      assert.equal(response.node, resolve(hostUri, 'house/kitchen#light'));
      assert.equal(response.lane, 'light/on');
      done();
    };
  });

  it('should sync a lane through a lane scope', function (done) {
    var nodeUri = resolve(hostUri, 'house/kitchen#light');
    var body = recon.parse('@switch { level: 100 }');
    socket.receive = function (request) {
      assert(request.isSyncRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
      socket.send(new proto.EventMessage('house/kitchen#light', 'light/on', body));
      socket.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var lane = client.lane(hostUri, 'house/kitchen#light', 'light/on');
    var downlink = lane.sync();
    var state = 0;
    downlink.onSync = function (request) {
      assert.equal(state, 0);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      state = 1;
    };
    downlink.onEvent = function (response) {
      assert.equal(state, 1);
      assert.equal(response.node, nodeUri);
      assert.equal(response.lane, 'light/on');
      assert.same(response.body, body);
      state = 2;
    };
    downlink.onSynced = function (response) {
      assert.equal(response.node, nodeUri);
      assert.equal(response.lane, 'light/on');
      assert.equal(state, 2);
      done();
    };
  });

  it('should unlink a lane through a lane scope', function (done) {
    socket.receive = function (request) {
      if (request.isLinkRequest) {
        socket.send(new proto.LinkedResponse(request.node, request.lane));
      } else if (request.isUnlinkRequest) {
        socket.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var lane = client.lane(hostUri, 'house/kitchen#light', 'light/on');
    var downlink = lane.link();
    downlink.onLinked = function (response) {
      downlink.close();
    };
    downlink.onUnlink = function (request) {
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      done();
    };
  });

  it('should command a lane through a lane scope', function (done) {
    var body = recon.parse('@switch { level: 0 }');
    socket.receive = function (message) {
      assert(message.isCommandMessage);
      assert.equal(message.node, 'house');
      assert.equal(message.lane, 'light/off');
      assert.same(message.body, body);
      done();
    };
    var lane = client.lane(hostUri, 'house', 'light/off');
    lane.command(body);
  });

  it('should close all member links when a lane scope closes', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      socket.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var lane = client.lane(hostUri, 'house/kitchen#light', 'light/on');
    var linkCount = 0;
    var closeCount = 0;
    function onLink(request) {
      linkCount += 1;
      if (linkCount === 2) lane.close();
    }
    function onClose() {
      closeCount += 1;
      if (closeCount === 2) done();
    }
    var downlink1 = lane.link();
    downlink1.onLink = onLink;
    downlink1.onClose = onClose;
    var downlink2 = lane.link();
    downlink2.onLink = onLink;
    downlink2.onClose = onClose;
  });


  it('should link and unlink multiple lanes', function (done) {
    var linkCount = 0;
    var unlinkCount = 0;
    socket.receive = function (request) {
      if (request.isLinkRequest) {
        linkCount += 1;
        socket.send(new proto.LinkedResponse(request.node, request.lane));
        if (linkCount === 4) socket.send(new proto.EventMessage('house/bedroom#light', 'light/on'));
      } else if (request.isUnlinkRequest) {
        unlinkCount += 1;
        socket.send(new proto.UnlinkedResponse(request.node, request.lane));
        if (unlinkCount === 3) done();
      }
    };
    var downlink1 = client.link(resolve(hostUri, 'house/kitchen#light'), 'light/on');
    var downlink2 = client.link(resolve(hostUri, 'house/kitchen#light'), 'light/on');
    var downlink3 = client.link(resolve(hostUri, 'house/kitchen#light'), 'light/off');
    var downlink4 = client.link(resolve(hostUri, 'house/bedroom#light'), 'light/on');
    downlink4.onEvent = function (message) {
      downlink4.close();
      downlink2.close();
      downlink3.close();
      downlink1.close();
    };
  });

  it('should receive events from multicast links', function (done) {
    var nodeUri = resolve(hostUri, 'house/kitchen#light');
    var body = recon.parse('@switch { level: 100 }');
    var linkCount = 0;
    socket.receive = function (request) {
      linkCount += 1;
      assert(request.isLinkRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
      if (linkCount === 2) socket.send(new proto.EventMessage('house/kitchen#light', 'light/on', body));
    };
    var eventCount = 0;
    function onEvent(message) {
      eventCount += 1;
      assert.equal(message.node, nodeUri);
      assert.equal(message.lane, 'light/on');
      assert.same(message.body, body);
      if (eventCount === 2) done();
    }
    var downlink1 = client.link(nodeUri, 'light/on');
    var downlink2 = client.link(nodeUri, 'light/on');
    downlink1.onEvent = onEvent;
    downlink2.onEvent = onEvent;
  });

  it('should close links that fail to connect', function (done) {
    var connectCount = 0;
    socket.receive = function (request) {
      connectCount += 1;
      assert.equal(connectCount, 1);
      socket.close();
    };
    var downlink = client.link(resolve(hostUri, 'house/kitchen#light'), 'light/on');
    downlink.onClose = function () {
      done();
    };
  });

  it('should retry keepalive links that fail to connect', function (done) {
    var connectCount = 0;
    socket.receive = function (request) {
      connectCount += 1;
      if (connectCount <= 2) {
        socket.close();
      } else {
        assert(request.isLinkRequest);
        socket.send(new proto.LinkedResponse(request.node, request.lane));
      }
    };
    var downlink = client.link(resolve(hostUri, 'house/kitchen#light'), 'light/on', {keepAlive: true});
    var disconnectCount = 0;
    downlink.onLinked = function (response) {
      assert.equal(disconnectCount, 2);
      downlink.close();
      done();
    };
    downlink.onDisconnect = function () {
      disconnectCount += 1;
    };
  });

  it('should close links when the connection closes', function (done) {
    var connectCount = 0;
    socket.receive = function (request) {
      connectCount += 1;
      assert.equal(connectCount, 1);
      assert(request.isLinkRequest);
      socket.send(new proto.LinkedResponse(request.node, request.lane));
      socket.close();
    };
    var downlink = client.link(resolve(hostUri, 'house/kitchen#light'), 'light/on');
    var linkCount = 0;
    downlink.onLinked = function (response) {
      linkCount += 1;
      assert.equal(linkCount, 1);
    };
    downlink.onClose = function () {
      assert.equal(linkCount, 1);
      done();
    };
  });

  it('should reconnect keepalive links when the connection closes', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      socket.send(new proto.LinkedResponse(request.node, request.lane));
      socket.close();
    };
    var downlink = client.link(resolve(hostUri, 'house/kitchen#light'), 'light/on', {keepAlive: true});
    var linkCount = 0;
    var disconnectCount = 0;
    downlink.onLinked = function (response) {
      linkCount += 1;
    };
    downlink.onDisconnect = function (response) {
      disconnectCount += 1;
      assert.equal(linkCount, disconnectCount);
      if (disconnectCount === 3) {
        downlink.close();
        done();
      }
    };
  });

  it('should change the keepalive mode of active links', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      socket.send(new proto.LinkedResponse(request.node, request.lane));
      socket.close();
    };
    var downlink = client.link(resolve(hostUri, 'house/kitchen#light'), 'light/on');
    var linkCount = 0;
    var disconnectCount = 0;
    downlink.onLinked = function (response) {
      linkCount += 1;
      if (linkCount === 1) {
        assert(!downlink.keepAlive);
        downlink.keepAlive = true;
        assert(downlink.keepAlive);
      } else if (linkCount === 2) {
        assert(downlink.keepAlive);
        downlink.keepAlive = false;
        assert(!downlink.keepAlive);
      }
    };
    downlink.onDisconnect = function (response) {
      disconnectCount += 1;
      assert.equal(linkCount, disconnectCount);
    };
    downlink.onClose = function () {
      assert.equal(linkCount, 2);
      assert.equal(disconnectCount, 2);
      done();
    };
  });

  it('should return the connected state of active links', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      socket.send(new proto.LinkedResponse(request.node, request.lane));
      socket.close();
    };
    var downlink = client.link(resolve(hostUri, 'house/kitchen#light'), 'light/on');
    downlink.onLinked = function (response) {
      assert(downlink.connected);
    };
    downlink.onDisconnect = function (response) {
      assert(!downlink.connected);
      done();
    };
  });

  it('should close unlinked links', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      socket.send(new proto.UnlinkedResponse(request.node, request.lane));
    };
    var downlink = client.link(resolve(hostUri, 'house/kitchen#light'), 'light/on');
    var unlinkCount = 0;
    downlink.onUnlinked = function () {
      unlinkCount += 1;
    };
    downlink.onClose = function () {
      assert.equal(unlinkCount, 1);
      done();
    };
  });

  it('should ignore non-text frames', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      socket.sendBytes(new Buffer(0));
      socket.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var downlink = client.link(resolve(hostUri, 'house/kitchen#light'), 'light/on');
    downlink.onLinked = function (response) {
      done();
    };
  });

  it('should ignore invalid envelopes', function (done) {
    socket.receive = function (request) {
      assert(request.isLinkRequest);
      socket.sendText('@foo');
      socket.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var downlink = client.link(resolve(hostUri, 'house/kitchen#light'), 'light/on');
    downlink.onLinked = function (response) {
      done();
    };
  });

  it('should buffer a limited number of commands', function (done) {
    var receiveCount = 0;
    socket.receive = function (message) {
      receiveCount += 1;
      assert(receiveCount <= 1024);
      if (receiveCount === 1024) setTimeout(done, 100);
    };
    for (var i = 0; i < 2048; i += 1) {
      client.command(resolve(hostUri, 'house/kitchen#light'), 'light/on');
    }
  });
});
