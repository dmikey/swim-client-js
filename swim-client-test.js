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
    assert.fail(x, y, recon.stringify(x) + ' did not equal ' + recon.stringify(y));
  }
};

function TestFixture() {
  this.hostUri = 'http://localhost:8009';
}
TestFixture.prototype.start = function (done) {
  var test = this;
  test.client = swim.client();
  test.httpServer = http.createServer();
  test.httpServer.listen(8009, function () {
    done();
  });
  test.wsServer = new WebSocket.server({
    httpServer: test.httpServer
  });
  test.wsServer.on('request', function (request) {
    test.connection = request.accept(request.origin);
    test.connection.on('message', function (frame) {
      var envelope = proto.parse(frame.utf8Data);
      test.receive(envelope);
    });
    test.send = function (envelope) {
      var payload = proto.stringify(envelope);
      test.connection.sendUTF(payload);
    };
    test.sendText = function (string) {
      test.connection.sendUTF(string);
    };
    test.sendBytes = function (buffer) {
      test.connection.sendBytes(buffer);
    };
    test.close = function () {
      test.connection.close();
      test.connection = undefined;
    };
  });
};
TestFixture.prototype.stop = function (done) {
  var test = this;
  if (test.client) {
    test.client.close();
    test.client = null;
  }
  if (test.connection) {
    test.connection.close();
    test.connection = null;
  }
  test.wsServer.shutDown();
  test.httpServer.close(function () {
    test.wsServer = null;
    test.httpServer = null;
    done();
  });
};
TestFixture.prototype.resolve = function (nodeUri) {
  return recon.uri.stringify(recon.uri.resolve(this.hostUri, nodeUri));
};

var test = null;
function initSuite(suite) {
  suite.timeout(5000);
  suite.slow(5000);
  beforeEach(function (done) {
    test = new TestFixture();
    test.start(done);
  });
  afterEach(function (done) {
    test.stop(function () {
      test = null;
      done();
    });
  });
}


describe('Client', function () {
  initSuite(this);

  it('should receive onConnect callbacks on a client scope', function (done) {
    test.client.onConnect = function (info) {
      assert.equal(info.hostUri, test.hostUri);
      done();
    };
    test.client.command(test.hostUri, '/null', 'wakeup');
  });

  it('should receive onDisconnect callbacks on a client scope', function (done) {
    test.client.onConnect = function (info) {
      test.close();
    };
    test.client.onDisconnect = function (info) {
      assert.equal(info.hostUri, test.hostUri);
      done();
    };
    test.client.command(test.hostUri, '/null', 'wakeup');
  });

  it('should authorize a host through a client scope', function (done) {
    test.receive = function (request) {
      assert(request.isAuthRequest);
      assert.same(request.body, [{key: 1234}]);
      test.send(new proto.AuthedResponse({id: 5678}));
    };
    test.client.onAuthorize = function (info) {
      assert.equal(info.hostUri, test.hostUri);
      assert.same(info.session, [{id: 5678}]);
      done();
    };
    test.client.authorize(test.hostUri, {key: 1234});
  });

  it('should fail to authorize a host through a client scope', function (done) {
    test.receive = function (request) {
      assert(request.isAuthRequest);
      assert.same(request.body, [{key: 1234}]);
      test.send(new proto.DeauthedResponse({'@denied': null}));
    };
    test.client.onAuthorize = function (info) {
      assert.fail();
    };
    test.client.onDeauthorize = function (info) {
      assert.equal(info.hostUri, test.hostUri);
      assert.same(info.session, [{'@denied': null}]);
      done();
    };
    test.client.authorize(test.hostUri, {key: 1234});
  });

  it('should build a downlink through a client scope', function () {
    var downlink = test.client.downlink()
      .host(test.hostUri)
      .node('house/kitchen#light')
      .lane('light/on')
      .prio(0.5)
      .keepAlive()
      .link();
    assert.equal(downlink.hostUri, test.hostUri);
    assert.equal(downlink.nodeUri, test.resolve('house/kitchen#light'));
    assert.equal(downlink.laneUri, 'light/on');
    assert.equal(downlink.prio, 0.5);
    assert(downlink.keepAlive);
  });

  it('should create a link through a client scope', function () {
    var options = {prio: 0.5};
    var downlink = test.client.link(test.hostUri, 'house/kitchen#light', 'light/on', options);
    assert.equal(downlink.hostUri, test.hostUri);
    assert.equal(downlink.nodeUri, test.resolve('house/kitchen#light'));
    assert.equal(downlink.laneUri, 'light/on');
    assert.equal(downlink.prio, 0.5);
    assert(!downlink.keepAlive);
    assert.equal(downlink.options, options);
    assert.equal(downlink.delegate, downlink);
  });

  it('should create a synchronized link through a client scope', function () {
    var options = {prio: 0.5};
    var downlink = test.client.sync(test.hostUri, 'house/kitchen#light', 'light/on', options);
    assert.equal(downlink.hostUri, test.hostUri);
    assert.equal(downlink.nodeUri, test.resolve('house/kitchen#light'));
    assert.equal(downlink.laneUri, 'light/on');
    assert.equal(downlink.prio, 0.5);
    assert(!downlink.keepAlive);
    assert.equal(downlink.options, options);
    assert.equal(downlink.delegate, downlink);

    downlink = test.client.sync(test.resolve('house/kitchen#light'), 'light/on', options);
    assert.equal(downlink.hostUri, test.hostUri);
    assert.equal(downlink.nodeUri, test.resolve('house/kitchen#light'));
    assert.equal(downlink.laneUri, 'light/on');
    assert.equal(downlink.prio, 0.5);
    assert(!downlink.keepAlive);
    assert.equal(downlink.options, options);
    assert.equal(downlink.delegate, downlink);
  });

  it('should link a lane through a client scope', function (done) {
    var nodeUri = test.resolve('house/kitchen#light');
    test.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      test.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var downlink = test.client.link(nodeUri, 'light/on');
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
    var nodeUri = test.resolve('house/kitchen#light');
    var body = recon.parse('@switch { level: 100 }');
    test.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage('house/kitchen#light', 'light/on', body));
    };
    var downlink = test.client.link(nodeUri, 'light/on');
    downlink.onEvent = function (message) {
      assert.equal(message.node, nodeUri);
      assert.equal(message.lane, 'light/on');
      assert.same(message.body, body);
      done();
    };
  });

  it('should sync a lane through a client scope', function (done) {
    var nodeUri = test.resolve('house/kitchen#light');
    var body = recon.parse('@switch { level: 100 }');
    test.receive = function (request) {
      assert(request.isSyncRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage('house/kitchen#light', 'light/on', body));
      test.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var downlink = test.client.sync(nodeUri, 'light/on');
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
    test.receive = function (request) {
      if (request.isLinkRequest) {
        test.send(new proto.LinkedResponse(request.node, request.lane));
      } else if (request.isUnlinkRequest) {
        test.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var downlink = test.client.link(test.resolve('house/kitchen#light'), 'light/on');
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
    test.receive = function (message) {
      assert(message.isCommandMessage);
      assert.equal(message.node, 'house');
      assert.equal(message.lane, 'light/off');
      assert.same(message.body, body);
      done();
    };
    test.client.command(test.resolve('house'), 'light/off', body);
  });

  it('should link a meta lane through a client scope', function (done) {
    test.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      test.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var downlink = test.client.link(test.hostUri, 'swim:meta:router', 'gateway/info');
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
    test.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage('swim:meta:router', 'gateway/info', body));
    };
    var downlink = test.client.link(test.hostUri, 'swim:meta:router', 'gateway/info');
    downlink.onEvent = function (message) {
      assert.equal(message.node, 'swim:meta:router');
      assert.equal(message.lane, 'gateway/info');
      assert.same(message.body, body);
      done();
    };
  });

  it('should sync a meta lane through a client scope', function (done) {
    var body = recon.parse('@gateway');
    test.receive = function (request) {
      assert(request.isSyncRequest);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage('swim:meta:router', 'gateway/info', body));
      test.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var downlink = test.client.sync(test.hostUri, 'swim:meta:router', 'gateway/info');
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
    test.receive = function (request) {
      if (request.isLinkRequest) {
        test.send(new proto.LinkedResponse(request.node, request.lane));
      } else if (request.isUnlinkRequest) {
        test.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var downlink = test.client.link(test.hostUri, 'swim:meta:router', 'gateway/info');
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
    test.receive = function (message) {
      assert(message.isCommandMessage);
      assert.equal(message.node, 'swim:meta:router');
      assert.equal(message.lane, 'gateway/info');
      assert.same(message.body, body);
      done();
    };
    test.client.command(test.hostUri, 'swim:meta:router', 'gateway/info', body);
  });
});


describe('HostScope', function () {
  initSuite(this);

  it('should create a host scope from a client scope', function () {
    var host = test.client.host(test.hostUri);
    assert.equal(host.hostUri, test.hostUri);
  });

  it('should receive onConnect callbacks on a host scope', function (done) {
    var host = test.client.host(test.hostUri);
    host.onConnect = function (info) {
      assert(host.isConnected);
      assert.equal(info.hostUri, test.hostUri);
      done();
    };
    host.command('/null', 'wakeup');
  });

  it('should receive onDisconnect callbacks on a host scope', function (done) {
    var host = test.client.host(test.hostUri);
    host.onConnect = function (info) {
      test.close();
    };
    host.onDisconnect = function (info) {
      assert(!host.isConnected);
      assert.equal(info.hostUri, test.hostUri);
      done();
    };
    host.command('/null', 'wakeup');
  });

  it('should authorize a host scope', function (done) {
    test.receive = function (request) {
      assert(request.isAuthRequest);
      assert.same(request.body, [{key: 1234}]);
      test.send(new proto.AuthedResponse({id: 5678}));
    };
    var host = test.client.host(test.hostUri);
    host.onAuthorize = function (info) {
      assert(host.isAuthorized);
      assert.equal(host.session, info.session);
      assert.equal(info.hostUri, test.hostUri);
      assert.same(info.session, [{id: 5678}]);
      done();
    };
    host.authorize({key: 1234});
  });

  it('should fail to authorize a host scope', function (done) {
    test.receive = function (request) {
      assert(request.isAuthRequest);
      assert.same(request.body, [{key: 1234}]);
      test.send(new proto.DeauthedResponse({'@denied': null}));
    };
    var host = test.client.host(test.hostUri);
    host.onAuthorize = function (info) {
      assert.fail();
    };
    host.onDeauthorize = function (info) {
      assert(!host.isAuthorized);
      assert.equal(host.session, null);
      assert.equal(info.hostUri, test.hostUri);
      assert.same(info.session, [{'@denied': null}]);
      done();
    };
    host.authorize({key: 1234});
  });

  it('should build a downlink through a host scope', function () {
    var host = test.client.host(test.hostUri);
    var downlink = host.downlink()
      .node('house/kitchen#light')
      .lane('light/on')
      .prio(0.5)
      .keepAlive()
      .link();
    assert.equal(downlink.hostUri, test.hostUri);
    assert.equal(downlink.nodeUri, test.resolve('house/kitchen#light'));
    assert.equal(downlink.laneUri, 'light/on');
    assert.equal(downlink.prio, 0.5);
    assert(downlink.keepAlive);
  });

  it('should link a lane through a host scope', function (done) {
    test.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      test.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var host = test.client.host(test.hostUri);
    var downlink = host.link('house/kitchen#light', 'light/on');
    var linkCount = 0;
    downlink.onLink = function (request) {
      linkCount += 1;
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
    };
    downlink.onLinked = function (response) {
      assert.equal(linkCount, 1);
      assert.equal(response.node, test.resolve('house/kitchen#light'));
      assert.equal(response.lane, 'light/on');
      done();
    };
  });

  it('should sync a lane through a host scope', function (done) {
    var nodeUri = test.resolve('house/kitchen#light');
    var body = recon.parse('@switch { level: 100 }');
    test.receive = function (request) {
      assert(request.isSyncRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage('house/kitchen#light', 'light/on', body));
      test.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var host = test.client.host(test.hostUri);
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
    test.receive = function (request) {
      if (request.isLinkRequest) {
        test.send(new proto.LinkedResponse(request.node, request.lane));
      } else if (request.isUnlinkRequest) {
        test.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var host = test.client.host(test.hostUri);
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
    test.receive = function (message) {
      assert(message.isCommandMessage);
      assert.equal(message.node, 'house');
      assert.equal(message.lane, 'light/off');
      assert.same(message.body, body);
      done();
    };
    var host = test.client.host(test.hostUri);
    host.command('house', 'light/off', body);
  });

  it('should link a meta lane through a host scope', function (done) {
    test.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      test.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var host = test.client.host(test.hostUri);
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
    var nodeUri = test.resolve('swim:meta:router');
    var body = recon.parse('@gateway');
    test.receive = function (request) {
      assert(request.isSyncRequest);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage('swim:meta:router', 'gateway/info', body));
      test.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var host = test.client.host(test.hostUri);
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
    test.receive = function (request) {
      if (request.isLinkRequest) {
        test.send(new proto.LinkedResponse(request.node, request.lane));
      } else if (request.isUnlinkRequest) {
        test.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var host = test.client.host(test.hostUri);
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
    test.receive = function (message) {
      assert(message.isCommandMessage);
      assert.equal(message.node, 'swim:meta:router');
      assert.equal(message.lane, 'gateway/info');
      assert.same(message.body, body);
      done();
    };
    var host = test.client.host(test.hostUri);
    host.command('swim:meta:router', 'gateway/info', body);
  });

  it('should close all member links when a host scope closes', function (done) {
    test.receive = function (request) {
      assert(request.isLinkRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var host = test.client.host(test.hostUri);
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
});


describe('NodeScope', function () {
  initSuite(this);

  it('should create a node scope from a client scope', function () {
    var nodeUri = test.resolve('house/kitchen#light');
    var node1 = test.client.node(test.hostUri, 'house/kitchen#light');
    var node2 = test.client.node(nodeUri);
    assert.equal(node1.hostUri, test.hostUri);
    assert.equal(node1.nodeUri, nodeUri);
    assert.equal(node2.hostUri, test.hostUri);
    assert.equal(node2.nodeUri, nodeUri);
  });

  it('should create a node scope from a host scope', function () {
    var nodeUri = test.resolve('house/kitchen#light');
    var host = test.client.host(test.hostUri);
    var node = host.node('house/kitchen#light');
    assert.equal(node.hostUri, test.hostUri);
    assert.equal(node.nodeUri, nodeUri);
  });

  it('should rewrite swim URI schemes in host URIs extracted from node URIs', function () {
    var node1 = test.client.node('swim://example.com/');
    assert.equal(node1.hostUri, 'ws://example.com');
    var node2 = test.client.node('swims://example.com/');
    assert.equal(node2.hostUri, 'wss://example.com');
  });

  it('should receive onConnect callbacks on a node scope', function (done) {
    var node = test.client.node(test.hostUri, '/null');
    node.onConnect = function (info) {
      assert(node.isConnected);
      assert.equal(info.hostUri, test.hostUri);
      done();
    };
    node.command('wakeup');
  });

  it('should receive onDisconnect callbacks on a node scope', function (done) {
    var node = test.client.node(test.hostUri, '/null');
    node.onConnect = function (info) {
      test.close();
    };
    node.onDisconnect = function (info) {
      assert(!node.isConnected);
      assert.equal(info.hostUri, test.hostUri);
      done();
    };
    node.command('wakeup');
  });

  it('should build a downlink through a node scope', function () {
    var node = test.client.node(test.hostUri, 'house/kitchen#light');
    var downlink = node.downlink()
      .lane('light/on')
      .prio(0.5)
      .keepAlive()
      .link();
    assert.equal(downlink.hostUri, test.hostUri);
    assert.equal(downlink.nodeUri, test.resolve('house/kitchen#light'));
    assert.equal(downlink.laneUri, 'light/on');
    assert.equal(downlink.prio, 0.5);
    assert(downlink.keepAlive);
  });

  it('should link a lane through a node scope', function (done) {
    test.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      test.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var node = test.client.node(test.hostUri, 'house/kitchen#light');
    var downlink = node.link('light/on');
    var linkCount = 0;
    downlink.onLink = function (request) {
      linkCount += 1;
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
    };
    downlink.onLinked = function (response) {
      assert.equal(linkCount, 1);
      assert.equal(response.node, test.resolve('house/kitchen#light'));
      assert.equal(response.lane, 'light/on');
      done();
    };
  });

  it('should sync a lane through a node scope', function (done) {
    var nodeUri = test.resolve('house/kitchen#light');
    var body = recon.parse('@switch { level: 100 }');
    test.receive = function (request) {
      assert(request.isSyncRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage('house/kitchen#light', 'light/on', body));
      test.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var node = test.client.node(test.hostUri, 'house/kitchen#light');
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
    test.receive = function (request) {
      if (request.isLinkRequest) {
        test.send(new proto.LinkedResponse(request.node, request.lane));
      } else if (request.isUnlinkRequest) {
        test.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var node = test.client.node(test.hostUri, 'house/kitchen#light');
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
    test.receive = function (message) {
      assert(message.isCommandMessage);
      assert.equal(message.node, 'house');
      assert.equal(message.lane, 'light/off');
      assert.same(message.body, body);
      done();
    };
    var node = test.client.node(test.hostUri, 'house');
    node.command('light/off', body);
  });

  it('should link a lane through a meta node scope', function (done) {
    test.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      test.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var node = test.client.node(test.hostUri, 'swim:meta:router');
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
    var nodeUri = test.resolve('swim:meta:router');
    var body = recon.parse('@gateway');
    test.receive = function (request) {
      assert(request.isSyncRequest);
      assert.equal(request.node, 'swim:meta:router');
      assert.equal(request.lane, 'gateway/info');
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage('swim:meta:router', 'gateway/info', body));
      test.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var node = test.client.node(test.hostUri, 'swim:meta:router');
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
    test.receive = function (request) {
      if (request.isLinkRequest) {
        test.send(new proto.LinkedResponse(request.node, request.lane));
      } else if (request.isUnlinkRequest) {
        test.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var node = test.client.node(test.hostUri, 'swim:meta:router');
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
    test.receive = function (message) {
      assert(message.isCommandMessage);
      assert.equal(message.node, 'swim:meta:router');
      assert.equal(message.lane, 'gateway/info');
      assert.same(message.body, body);
      done();
    };
    var node = test.client.node(test.hostUri, 'swim:meta:router');
    node.command('gateway/info', body);
  });

  it('should close all member links when a node scope closes', function (done) {
    test.receive = function (request) {
      assert(request.isLinkRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var node = test.client.node(test.hostUri, 'house/kitchen#light');
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
});


describe('LaneScope', function () {
  initSuite(this);

  it('should create a lane scope from a client scope', function () {
    var nodeUri = test.resolve('house/kitchen#light');
    var lane1 = test.client.lane(test.hostUri, 'house/kitchen#light', 'light/on');
    var lane2 = test.client.lane(nodeUri, 'light/on');
    assert.equal(lane1.hostUri, test.hostUri);
    assert.equal(lane1.nodeUri, nodeUri);
    assert.equal(lane1.laneUri, 'light/on');
    assert.equal(lane2.hostUri, test.hostUri);
    assert.equal(lane2.nodeUri, nodeUri);
    assert.equal(lane2.laneUri, 'light/on');
  });

  it('should create a lane scope from a host scope', function () {
    var nodeUri = test.resolve('house/kitchen#light');
    var host = test.client.host(test.hostUri);
    var lane = host.lane('house/kitchen#light', 'light/on');
    assert.equal(lane.hostUri, test.hostUri);
    assert.equal(lane.nodeUri, nodeUri);
    assert.equal(lane.laneUri, 'light/on');
  });

  it('should create a lane scope from a node scope', function () {
    var nodeUri = test.resolve('house/kitchen#light');
    var node = test.client.node(nodeUri);
    var lane = node.lane('light/on');
    assert.equal(lane.hostUri, test.hostUri);
    assert.equal(lane.nodeUri, nodeUri);
    assert.equal(lane.laneUri, 'light/on');
  });

  it('should receive onConnect callbacks on a lane scope', function (done) {
    var lane = test.client.lane(test.hostUri, '/null', 'wakeup');
    lane.onConnect = function (info) {
      assert(lane.isConnected);
      assert.equal(info.hostUri, test.hostUri);
      done();
    };
    lane.command();
  });

  it('should receive onDisconnect callbacks on a lane scope', function (done) {
    var lane = test.client.lane(test.hostUri, '/null', 'wakeup');
    lane.onConnect = function (info) {
      test.close();
    };
    lane.onDisconnect = function (info) {
      assert(!lane.isConnected);
      assert.equal(info.hostUri, test.hostUri);
      done();
    };
    lane.command();
  });

  it('should build a downlink through a lane scope', function () {
    var lane = test.client.lane(test.hostUri, 'house/kitchen#light', 'light/on');
    var downlink = lane.downlink()
      .prio(0.5)
      .keepAlive()
      .link();
    assert.equal(downlink.hostUri, test.hostUri);
    assert.equal(downlink.nodeUri, test.resolve('house/kitchen#light'));
    assert.equal(downlink.laneUri, 'light/on');
    assert.equal(downlink.prio, 0.5);
    assert(downlink.keepAlive);
  });

  it('should link a lane through a lane scope', function (done) {
    test.receive = function (request) {
      assert(request.isLinkRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      test.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var lane = test.client.lane(test.hostUri, 'house/kitchen#light', 'light/on');
    var downlink = lane.link();
    var linkCount = 0;
    downlink.onLink = function (request) {
      linkCount += 1;
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
    };
    downlink.onLinked = function (response) {
      assert.equal(linkCount, 1);
      assert.equal(response.node, test.resolve('house/kitchen#light'));
      assert.equal(response.lane, 'light/on');
      done();
    };
  });

  it('should sync a lane through a lane scope', function (done) {
    var nodeUri = test.resolve('house/kitchen#light');
    var body = recon.parse('@switch { level: 100 }');
    test.receive = function (request) {
      assert(request.isSyncRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage('house/kitchen#light', 'light/on', body));
      test.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var lane = test.client.lane(test.hostUri, 'house/kitchen#light', 'light/on');
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
    test.receive = function (request) {
      if (request.isLinkRequest) {
        test.send(new proto.LinkedResponse(request.node, request.lane));
      } else if (request.isUnlinkRequest) {
        test.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var lane = test.client.lane(test.hostUri, 'house/kitchen#light', 'light/on');
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
    test.receive = function (message) {
      assert(message.isCommandMessage);
      assert.equal(message.node, 'house');
      assert.equal(message.lane, 'light/off');
      assert.same(message.body, body);
      done();
    };
    var lane = test.client.lane(test.hostUri, 'house', 'light/off');
    lane.command(body);
  });

  it('should close all member links when a lane scope closes', function (done) {
    test.receive = function (request) {
      assert(request.isLinkRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var lane = test.client.lane(test.hostUri, 'house/kitchen#light', 'light/on');
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
});


describe('ListDownlink', function () {
  initSuite(this);

  it('should create a synchronized list link through a client scope', function () {
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/users');
    assert.same(downlink.length, 0);
    assert.same(downlink.state, []);
    downlink = test.client.syncList(test.resolve('chat/public'), 'chat/users');
    assert.same(downlink.length, 0);
    assert.same(downlink.state, []);
  });

  it('should create a synchronized list link through a host scope', function () {
    var host = test.client.host(test.hostUri);
    var downlink = host.syncList('chat/public', 'chat/users');
    assert.same(downlink.length, 0);
    assert.same(downlink.state, []);
  });

  it('should create a synchronized list link through a node scope', function () {
    var node = test.client.node(test.hostUri, 'chat/public');
    var downlink = node.syncList('chat/users');
    assert.same(downlink.length, 0);
    assert.same(downlink.state, []);
  });

  it('should create a synchronized list link through a lane scope', function () {
    var lane = test.client.lane(test.hostUri, 'chat/public', 'chat/users');
    var downlink = lane.syncList();
    assert.same(downlink.length, 0);
    assert.same(downlink.state, []);
  });

  it('should sync a list lane', function (done) {
    test.receive = function (request) {
      assert(request.isSyncRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane, [{subject: 'foo'}]));
      test.send(new proto.EventMessage(request.node, request.lane, [{subject: 'bar'}]));
      test.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/room');
    downlink.onSynced = function (response) {
      assert.same(downlink.length, 2);
      assert.same(downlink.get(0), [{subject: 'foo'}]);
      assert.same(downlink.get(1), [{subject: 'bar'}]);
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'bar'}]]);
      done();
    };
  });

  it('should update a synchronized list link', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'foo'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'bar'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane, message.body));
      }
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/room');
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'bar'}]]);
      downlink.set(1, [{subject: 'baz'}]);
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{'@update': [{index: 1}]}, {subject: 'baz'}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert.same(downlink.length, 2);
        assert.same(downlink.get(1), [{subject: 'baz'}]);
        assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'baz'}]]);
        done();
      }
    };
  });

  it('should push a value onto a synchronized list link', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'foo'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'bar'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane,
          recon.concat([{'@insert': [{index: 2}]}], message.body)));
      }
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/room');
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'bar'}]]);
      downlink.push([{subject: 'baz'}]);
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{subject: 'baz'}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert.same(downlink.length, 3);
        assert.same(downlink.get(2), [{subject: 'baz'}]);
        assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'bar'}], [{subject: 'baz'}]]);
        done();
      }
    };
  });

  it('should pop a value off of a synchronized list link', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'foo'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'bar'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane, message.body));
      }
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/room');
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'bar'}]]);
      var value = downlink.pop();
      assert.same(value, [{subject: 'bar'}]);
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{'@remove': [{index: 1}]}, {subject: 'bar'}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert.same(downlink.length, 1);
        assert.same(downlink.state, [[{subject: 'foo'}]]);
        downlink.forEach(function (value, index) {
          assert.same(value, [{subject: 'foo'}]);
          assert.equal(index, 0);
        });
        done();
      }
    };
  });

  it('should unshift a value onto a synchronized list link', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'foo'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'bar'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane, message.body));
      }
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/room');
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'bar'}]]);
      downlink.unshift([{subject: 'baz'}]);
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{'@insert': [{index: 0}]}, {subject: 'baz'}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert.same(downlink.length, 3);
        assert.same(downlink.get(0), [{subject: 'baz'}]);
        assert.same(downlink.state, [[{subject: 'baz'}], [{subject: 'foo'}], [{subject: 'bar'}]]);
        done();
      }
    };
  });

  it('should shift a value off of a synchronized list link', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'foo'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'bar'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane, message.body));
      }
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/room');
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'bar'}]]);
      var value = downlink.shift();
      assert.same(value, [{subject: 'foo'}]);
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{'@remove': [{index: 0}]}, {subject: 'foo'}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert.same(downlink.length, 1);
        assert.same(downlink.state, [[{subject: 'bar'}]]);
        downlink.forEach(function (value, index) {
          assert.same(value, [{subject: 'bar'}]);
          assert.equal(index, 0);
        });
        done();
      }
    };
  });

  it('should remove a value from a synchronized list link', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'foo'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'bar'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'baz'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane, message.body));
      }
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/room');
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'bar'}], [{subject: 'baz'}]]);
      var removed = downlink.splice(1, 1);
      assert.same(removed, [[{subject: 'bar'}]]);
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{'@remove': [{index: 1}]}, {subject: 'bar'}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert.same(downlink.length, 2);
        assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'baz'}]]);
        done();
      }
    };
  });

  it('should move a value in a synchronized list link', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'foo'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'bar'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'baz'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane, message.body));
      }
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/room');
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'bar'}], [{subject: 'baz'}]]);
      downlink.move(2, 1);
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{'@move': [{from: 2}, {to: 1}]}, {subject: 'baz'}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert.same(downlink.length, 3);
        assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'baz'}], [{subject: 'bar'}]]);
        done();
      }
    };
  });

  it('should splice a new value into a synchronized list link', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'foo'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'bar'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'baz'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane, message.body));
      }
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/room');
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'bar'}], [{subject: 'baz'}]]);
      var removed = downlink.splice(1, 1, [{subject: 'zap'}]);
      assert.same(removed, [[{subject: 'bar'}]]);
    };
    downlink.onCommand = function (message) {
      if (state === 1) {
        state = 2;
        assert.same(message.body, [{'@remove': [{index: 1}]}, {subject: 'bar'}]);
      } else if (state === 2) {
        state = 3;
        assert.same(message.body, [{'@insert': [{index: 1}]}, {subject: 'zap'}]);
      }
    };
    downlink.onEvent = function (message) {
      if (state === 3) {
        state = 4;
        assert.same(downlink.length, 3);
        assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'zap'}], [{subject: 'baz'}]]);
      } else if (state === 4) {
        assert.same(downlink.length, 3);
        assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'zap'}], [{subject: 'baz'}]]);
        done();
      }
    };
  });

  it('should clear a synchronized list link', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'foo'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{subject: 'baz'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane, message.body));
      }
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/users');
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'baz'}]]);
      downlink.clear();
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{'@clear': null}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert.same(message.body, [{'@clear': null}]);
        assert.equal(downlink.length, 0);
        assert.same(downlink.state, []);
        done();
      }
    };
  });

  it('should remotely update synchronized list link values', function (done) {
    test.receive = function (request) {
      assert(request.isSyncRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane, [{subject: 'foo'}]));
      test.send(new proto.EventMessage(request.node, request.lane, [{subject: 'bar'}]));
      test.send(new proto.SyncedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane,
        [{'@update': [{index: 1}]}, {subject: 'baz'}]));
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/users');
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'bar'}]]);
    };
    downlink.onEvent = function (message) {
      if (state === 1) {
        assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'baz'}]]);
        done();
      }
    };
  });

  it('should remotely insert synchronized list link values', function (done) {
    test.receive = function (request) {
      assert(request.isSyncRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane, [{subject: 'foo'}]));
      test.send(new proto.EventMessage(request.node, request.lane, [{subject: 'baz'}]));
      test.send(new proto.SyncedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane,
        [{'@insert': [{index: 1}]}, {subject: 'bar'}]));
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/users');
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'baz'}]]);
    };
    downlink.onEvent = function (message) {
      if (state === 1) {
        assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'bar'}], [{subject: 'baz'}]]);
        done();
      }
    };
  });

  it('should remotely remove synchronized list link values', function (done) {
    test.receive = function (request) {
      assert(request.isSyncRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane, [{subject: 'foo'}]));
      test.send(new proto.EventMessage(request.node, request.lane, [{subject: 'bar'}]));
      test.send(new proto.EventMessage(request.node, request.lane, [{subject: 'baz'}]));
      test.send(new proto.SyncedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane,
        [{'@remove': [{index: 1}]}, {subject: 'bar'}]));
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/users');
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'bar'}], [{subject: 'baz'}]]);
    };
    downlink.onEvent = function (message) {
      if (state === 1) {
        assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'baz'}]]);
        done();
      }
    };
  });

  it('should remotely move a value in a synchronized list link', function (done) {
    test.receive = function (request) {
      assert(request.isSyncRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane, [{subject: 'foo'}]));
      test.send(new proto.EventMessage(request.node, request.lane, [{subject: 'bar'}]));
      test.send(new proto.EventMessage(request.node, request.lane, [{subject: 'baz'}]));
      test.send(new proto.SyncedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane,
        [{'@move': [{from: 2}, {to: 1}]}, {subject: 'baz'}]));
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/room');
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'bar'}], [{subject: 'baz'}]]);
    };
    downlink.onEvent = function (message) {
      if (state === 1) {
        assert.same(downlink.length, 3);
        assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'baz'}], [{subject: 'bar'}]]);
        done();
      }
    };
  });

  it('should remotely clear synchronized list link values', function (done) {
    test.receive = function (request) {
      assert(request.isSyncRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane, [{subject: 'foo'}]));
      test.send(new proto.EventMessage(request.node, request.lane, [{subject: 'baz'}]));
      test.send(new proto.SyncedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane, [{'@clear': null}]));
    };
    var downlink = test.client.syncList(test.hostUri, 'chat/public', 'chat/users');
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{subject: 'foo'}], [{subject: 'baz'}]]);
    };
    downlink.onEvent = function (message) {
      if (state === 1) {
        assert.equal(downlink.length, 0);
        assert.same(downlink.state, []);
        done();
      }
    };
  });
});


describe('MapDownlink', function () {
  initSuite(this);

  it('should create a synchronized map link through a client scope', function () {
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users');
    assert.same(downlink.size, 0);
    assert.same(downlink.state, []);
    downlink = test.client.syncMap(test.resolve('chat/public'), 'chat/users');
    assert.same(downlink.size, 0);
    assert.same(downlink.state, []);
  });

  it('should create a synchronized map link through a host scope', function () {
    var host = test.client.host(test.hostUri);
    var downlink = host.syncMap('chat/public', 'chat/users');
    assert.same(downlink.size, 0);
    assert.same(downlink.state, []);
  });

  it('should create a synchronized map link through a node scope', function () {
    var node = test.client.node(test.hostUri, 'chat/public');
    var downlink = node.syncMap('chat/users');
    assert.same(downlink.size, 0);
    assert.same(downlink.state, []);
  });

  it('should create a synchronized map link through a lane scope', function () {
    var lane = test.client.lane(test.hostUri, 'chat/public', 'chat/users');
    var downlink = lane.syncMap();
    assert.same(downlink.size, 0);
    assert.same(downlink.state, []);
  });

  it('should sync a map lane with a primaryKey function', function (done) {
    test.receive = function (request) {
      assert(request.isSyncRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane, [{id: 'a'}, {name: 'foo'}]));
      test.send(new proto.EventMessage(request.node, request.lane, [{id: 'b'}, {name: 'bar'}]));
      test.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users', {
      primaryKey: function (user) { return recon.get(user, 'id'); }
    });
    downlink.onSynced = function (response) {
      assert.same(downlink.size, 2);
      assert(downlink.has('a'));
      assert(downlink.has('b'));
      assert(!downlink.has('c'));
      assert.same(downlink.get('a'), [{id: 'a'}, {name: 'foo'}]);
      assert.same(downlink.get('b'), [{id: 'b'}, {name: 'bar'}]);
      assert.same(downlink.get('c'), undefined);
      assert.same(downlink.keys(), ['a', 'b']);
      assert.same(downlink.values(), [[{id: 'a'}, {name: 'foo'}], [{id: 'b'}, {name: 'bar'}]]);
      done();
    };
  });

  it('should sync a map lane with no primary key', function (done) {
    test.receive = function (request) {
      assert(request.isSyncRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane, [{id: 'a'}, {name: 'foo'}]));
      test.send(new proto.EventMessage(request.node, request.lane, [{id: 'a'}, {name: 'bar'}]));
      test.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users');
    downlink.onSynced = function (response) {
      assert.same(downlink.size, 2);
      assert.same(downlink.state, [[{id: 'a'}, {name: 'foo'}], [{id: 'a'}, {name: 'bar'}]]);
      done();
    };
  });

  it('should sync a map lane with non-string keys', function (done) {
    test.receive = function (request) {
      assert(request.isSyncRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane,
        [{id: 9}, {name: 'nine'}]));
      test.send(new proto.EventMessage(request.node, request.lane,
        [{id: 4}, {name: 'four'}]));
      test.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users', {
      primaryKey: 'id'
    });
    downlink.onSynced = function (response) {
      assert(downlink.has(9));
      assert(downlink.has(4));
      assert(!downlink.has(3));
      assert.same(downlink.get(9), [{id: 9}, {name: 'nine'}]);
      assert.same(downlink.get(4), [{id: 4}, {name: 'four'}]);
      assert.same(downlink.get(3), undefined);
      done();
    };
  });

  it('should sort a synchronized map link by comparison function', function (done) {
    test.receive = function (request) {
      assert(request.isSyncRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane, [{id: 'a'}, {name: 'foo'}]));
      test.send(new proto.EventMessage(request.node, request.lane, [{id: 'b'}, {name: 'bar'}]));
      test.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users', {
      primaryKey: 'id',
      sortBy: function (x, y) {
        return recon.compare(recon.get(x, 'name'), recon.get(y, 'name'));
      }
    });
    downlink.onSynced = function (response) {
      assert.same(downlink.state, [[{id: 'b'}, {name: 'bar'}], [{id: 'a'}, {name: 'foo'}]]);
      done();
    };
  });

  it('should sort a synchronized map link by value path', function (done) {
    test.receive = function (request) {
      assert(request.isSyncRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane, [{id: 'a'}, {name: 'foo'}]));
      test.send(new proto.EventMessage(request.node, request.lane, [{id: 'b'}, {name: 'bar'}]));
      test.send(new proto.SyncedResponse(request.node, request.lane));
    };
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users', {
      primaryKey: 'id',
      sortBy: 'name'
    });
    downlink.onSynced = function (response) {
      assert.same(downlink.state, [[{id: 'b'}, {name: 'bar'}], [{id: 'a'}, {name: 'foo'}]]);
      done();
    };
  });

  it('should insert new synchronized map link values', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{id: 'a'}, {name: 'foo'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane, message.body));
      }
    };
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users', {
      primaryKey: 'id'
    });
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{id: 'a'}, {name: 'foo'}]]);
      downlink.set('b', [{id: 'b'}, {name: 'bar'}]);
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{id: 'b'}, {name: 'bar'}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert.same(downlink.get('b'), [{id: 'b'}, {name: 'bar'}]);
        done();
      }
    };
  });

  it('should insert new synchronized map link values with non-string keys', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{id: 9}, {name: 'nine'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane, message.body));
      }
    };
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users', {
      primaryKey: 'id'
    });
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{id: 9}, {name: 'nine'}]]);
      downlink.set(4, [{id: 4}, {name: 'four'}]);
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{id: 4}, {name: 'four'}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert.same(downlink.get(4), [{id: 4}, {name: 'four'}]);
        done();
      }
    };
  });

  it('should update existing synchronized map link values', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{id: 'a'}, {name: 'foo'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{id: 'b'}, {name: 'bar'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane, message.body));
      }
    };
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users', {
      primaryKey: 'id'
    });
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{id: 'a'}, {name: 'foo'}], [{id: 'b'}, {name: 'bar'}]]);
      downlink.set('a', [{id: 'a'}, {name: 'baz'}]);
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{id: 'a'}, {name: 'baz'}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert.same(downlink.get('a'), [{id: 'a'}, {name: 'baz'}]);
        done();
      }
    };
  });

  it('should update existing synchronized map link values with non-string keys', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{id: 9}, {name: 'nine'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{id: 4}, {name: 'for'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane, message.body));
      }
    };
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users', {
      primaryKey: 'id'
    });
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{id: 9}, {name: 'nine'}], [{id: 4}, {name: 'for'}]]);
      downlink.set(4, [{id: 4}, {name: 'four'}]);
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{id: 4}, {name: 'four'}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert.same(downlink.get(4), [{id: 4}, {name: 'four'}]);
        done();
      }
    };
  });

  it('should remove synchronized map link values', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{id: 'a'}, {name: 'foo'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{id: 'b'}, {name: 'bar'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane,
          [{'@remove': null}, {id: 'a'}, {name: 'foo'}]));
      }
    };
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users', {
      primaryKey: 'id'
    });
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{id: 'a'}, {name: 'foo'}], [{id: 'b'}, {name: 'bar'}]]);
      downlink.delete('a');
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{'@remove': null}, {id: 'a'}, {name: 'foo'}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert(!downlink.has('a'));
        assert.same(downlink.get('a'), undefined);
        downlink.forEach(function (value) {
          assert.same(value, [{id: 'b'}, {name: 'bar'}]);
        });
        assert(!downlink.delete('a'));
        done();
      }
    };
  });

  it('should remove synchronized map link values with non-string keys', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{id: 4}, {name: 'four'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{id: 9}, {name: 'nine'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane,
          [{'@remove': null}, {id: 9}, {name: 'nine'}]));
      }
    };
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users', {
      primaryKey: 'id'
    });
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{id: 4}, {name: 'four'}], [{id: 9}, {name: 'nine'}]]);
      downlink.delete(9);
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{'@remove': null}, {id: 9}, {name: 'nine'}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert(!downlink.has(9));
        assert.same(downlink.get(9), undefined);
        assert(!downlink.delete(9));
        done();
      }
    };
  });

  it('should clear a synchronized map link', function (done) {
    test.receive = function (message) {
      if (message.isSyncRequest) {
        test.send(new proto.LinkedResponse(message.node, message.lane));
        test.send(new proto.EventMessage(message.node, message.lane, [{id: 'a'}, {name: 'foo'}]));
        test.send(new proto.EventMessage(message.node, message.lane, [{id: 'b'}, {name: 'bar'}]));
        test.send(new proto.SyncedResponse(message.node, message.lane));
      } else if (message.isCommandMessage) {
        test.send(new proto.EventMessage(message.node, message.lane, message.body));
      }
    };
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users', {
      primaryKey: 'id'
    });
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{id: 'a'}, {name: 'foo'}], [{id: 'b'}, {name: 'bar'}]]);
      downlink.clear();
    };
    downlink.onCommand = function (message) {
      assert.equal(state, 1);
      state = 2;
      assert.same(message.body, [{'@clear': null}]);
    };
    downlink.onEvent = function (message) {
      if (state === 2) {
        assert.same(message.body, [{'@clear': null}]);
        assert.equal(downlink.size, 0);
        assert.same(downlink.state, []);
        assert(!downlink.has('a'));
        assert(!downlink.has('b'));
        done();
      }
    };
  });

  it('should remotely remove synchronized map link values', function (done) {
    test.receive = function (request) {
      assert(request.isSyncRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane, [{id: 'a'}, {name: 'foo'}]));
      test.send(new proto.EventMessage(request.node, request.lane, [{id: 'b'}, {name: 'bar'}]));
      test.send(new proto.SyncedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane,
        [{'@remove': null}, {id: 'a'}, {name: 'foo'}]));
    };
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users', {
      primaryKey: 'id'
    });
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{id: 'a'}, {name: 'foo'}], [{id: 'b'}, {name: 'bar'}]]);
    };
    downlink.onEvent = function (message) {
      if (state === 1) {
        assert(!downlink.has('a'));
        assert.same(downlink.get('a'), undefined);
        assert(!downlink.delete('a'));
        done();
      }
    };
  });

  it('should remotely clear a synchronized map link', function (done) {
    test.receive = function (request) {
      assert(request.isSyncRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane, [{id: 'a'}, {name: 'foo'}]));
      test.send(new proto.EventMessage(request.node, request.lane, [{id: 'b'}, {name: 'bar'}]));
      test.send(new proto.SyncedResponse(request.node, request.lane));
      test.send(new proto.EventMessage(request.node, request.lane, [{'@clear': null}]));
    };
    var downlink = test.client.syncMap(test.hostUri, 'chat/public', 'chat/users', {
      primaryKey: 'id'
    });
    var state = 0;
    downlink.onSynced = function (response) {
      assert.equal(state, 0);
      state = 1;
      assert.same(downlink.state, [[{id: 'a'}, {name: 'foo'}], [{id: 'b'}, {name: 'bar'}]]);
    };
    downlink.onEvent = function (message) {
      if (state === 1) {
        assert.same(message.body, [{'@clear': null}]);
        assert.equal(downlink.size, 0);
        assert.same(downlink.state, []);
        assert(!downlink.has('a'));
        assert(!downlink.has('b'));
        done();
      }
    };
  });
});


describe('DownlinkBuilder', function () {
  initSuite(this);

  it('should build a minimally configured downlink', function () {
    var downlink = test.client.downlink()
      .node(test.resolve('house/kitchen#light'))
      .lane('light/on')
      .link();
    assert.equal(downlink.hostUri, test.hostUri);
    assert.equal(downlink.nodeUri, test.resolve('house/kitchen#light'));
    assert.equal(downlink.laneUri, 'light/on');
    assert.equal(downlink.prio, 0.0);
    assert(!downlink.keepAlive);
    assert.equal(downlink.delegate, downlink);
    assert.equal(downlink.onEvent, undefined);
    assert.equal(downlink.onCommand, undefined);
    assert.equal(downlink.onLink, undefined);
    assert.equal(downlink.onLinked, undefined);
    assert.equal(downlink.onSync, undefined);
    assert.equal(downlink.onSynced, undefined);
    assert.equal(downlink.onUnlink, undefined);
    assert.equal(downlink.onUnlinked, undefined);
    assert.equal(downlink.onConnect, undefined);
    assert.equal(downlink.onDisconnect, undefined);
    assert.equal(downlink.onError, undefined);
    assert.equal(downlink.onClose, undefined);
  });

  it('should build a downlink with event callbacks', function () {
    function onEvent(message) {}
    function onCommand(message) {}
    function onLink(request) {}
    function onLinked(response) {}
    function onSync(request) {}
    function onSynced(response) {}
    function onUnlink(request) {}
    function onUnlinked(response) {}
    function onConnect() {}
    function onDisconnect() {}
    function onError() {}
    function onClose() {}
    var downlink = test.client.downlink()
      .host(test.hostUri)
      .node('house/kitchen#light')
      .lane('light/on')
      .prio(0.5)
      .keepAlive()
      .onEvent(onEvent)
      .onCommand(onCommand)
      .onLink(onLink)
      .onLinked(onLinked)
      .onSync(onSync)
      .onSynced(onSynced)
      .onUnlink(onUnlink)
      .onUnlinked(onUnlinked)
      .onConnect(onConnect)
      .onDisconnect(onDisconnect)
      .onError(onError)
      .onClose(onClose)
      .link();
    assert.equal(downlink.hostUri, test.hostUri);
    assert.equal(downlink.nodeUri, test.resolve('house/kitchen#light'));
    assert.equal(downlink.laneUri, 'light/on');
    assert.equal(downlink.prio, 0.5);
    assert(downlink.keepAlive);
    assert.equal(downlink.delegate, downlink);
    assert.equal(downlink.onEvent, onEvent);
    assert.equal(downlink.onCommand, onCommand);
    assert.equal(downlink.onLink, onLink);
    assert.equal(downlink.onLinked, onLinked);
    assert.equal(downlink.onSync, onSync);
    assert.equal(downlink.onSynced, onSynced);
    assert.equal(downlink.onUnlink, onUnlink);
    assert.equal(downlink.onUnlinked, onUnlinked);
    assert.equal(downlink.onConnect, onConnect);
    assert.equal(downlink.onDisconnect, onDisconnect);
    assert.equal(downlink.onError, onError);
    assert.equal(downlink.onClose, onClose);
  });

  it('should build a downlink with an event delegate', function () {
    var delegate = {};
    var downlink = test.client.downlink()
      .node(test.resolve('house/kitchen#light'))
      .lane('light/on')
      .delegate(delegate)
      .link();
    assert.equal(downlink.delegate, delegate);
  });

  it('should build a linked downlink', function () {
    var downlink = test.client.downlink()
      .node(test.resolve('house/kitchen#light'))
      .lane('light/on')
      .link();
    assert.equal(downlink.constructor.name, 'LinkedDownlink');
  });

  it('should build a synced downlink', function () {
    var downlink = test.client.downlink()
      .node(test.resolve('house/kitchen#light'))
      .lane('light/on')
      .sync();
    assert.equal(downlink.constructor.name, 'SyncedDownlink');
  });

  it('should build a synchronized list downlink', function () {
    var downlink = test.client.downlink()
      .node(test.resolve('house/kitchen#light'))
      .lane('light/on')
      .syncList();
    assert.equal(downlink.constructor.name, 'ListDownlink');
  });

  it('should build a synchronized map downlink', function () {
    function primaryKey(value) {}
    function sortBy(x, y) {}
    var downlink = test.client.downlink()
      .node(test.resolve('house/kitchen#light'))
      .lane('light/on')
      .primaryKey(primaryKey)
      .sortBy(sortBy)
      .syncMap();
    assert.equal(downlink.constructor.name, 'MapDownlink');
    assert.equal(downlink.primaryKey, primaryKey);
    assert.equal(downlink.sortBy, sortBy);
  });
});


describe('Channel', function () {
  initSuite(this);

  it('should reauthorize reopened connections', function (done) {
    var messageCount = 0;
    test.receive = function (request) {
      messageCount += 1;
      if (messageCount === 1) {
        assert(request.isAuthRequest);
        assert.same(request.body, [{key: 1234}]);
        test.close();
      } else if (messageCount === 2) {
        assert(request.isAuthRequest);
        assert.same(request.body, [{key: 1234}]);
        test.send(new proto.AuthedResponse({id: 5678}));
      } else {
        assert(request.isCommandMessage);
      }
    };
    test.client.onDisconnect = function () {
      if (messageCount === 1) {
        test.client.command(test.hostUri, '/null', 'wakeup');
      }
    };
    test.client.onAuthorize = function (info) {
      assert.equal(messageCount, 3);
      assert.equal(info.hostUri, test.hostUri);
      assert.same(info.session, [{id: 5678}]);
      done();
    };
    test.client.authorize(test.hostUri, {key: 1234});
  });

  it('should link and unlink multiple lanes', function (done) {
    var linkCount = 0;
    var unlinkCount = 0;
    test.receive = function (request) {
      if (request.isLinkRequest) {
        linkCount += 1;
        test.send(new proto.LinkedResponse(request.node, request.lane));
        if (linkCount === 4) test.send(new proto.EventMessage('house/bedroom#light', 'light/on'));
      } else if (request.isUnlinkRequest) {
        unlinkCount += 1;
        test.send(new proto.UnlinkedResponse(request.node, request.lane));
        if (unlinkCount === 3) done();
      }
    };
    var downlink1 = test.client.link(test.resolve('house/kitchen#light'), 'light/on');
    var downlink2 = test.client.link(test.resolve('house/kitchen#light'), 'light/on');
    var downlink3 = test.client.link(test.resolve('house/kitchen#light'), 'light/off');
    var downlink4 = test.client.link(test.resolve('house/bedroom#light'), 'light/on');
    downlink4.onEvent = function (message) {
      downlink4.close();
      downlink2.close();
      downlink3.close();
      downlink1.close();
    };
  });

  it('should receive events from multicast links', function (done) {
    var nodeUri = test.resolve('house/kitchen#light');
    var body = recon.parse('@switch { level: 100 }');
    var linkCount = 0;
    test.receive = function (request) {
      linkCount += 1;
      assert(request.isLinkRequest);
      assert.equal(request.node, 'house/kitchen#light');
      assert.equal(request.lane, 'light/on');
      test.send(new proto.LinkedResponse(request.node, request.lane));
      if (linkCount === 2) test.send(new proto.EventMessage('house/kitchen#light', 'light/on', body));
    };
    var eventCount = 0;
    function onEvent(message) {
      eventCount += 1;
      assert.equal(message.node, nodeUri);
      assert.equal(message.lane, 'light/on');
      assert.same(message.body, body);
      if (eventCount === 2) done();
    }
    var downlink1 = test.client.link(nodeUri, 'light/on');
    var downlink2 = test.client.link(nodeUri, 'light/on');
    downlink1.onEvent = onEvent;
    downlink2.onEvent = onEvent;
  });

  it('should close links that fail to connect', function (done) {
    var connectCount = 0;
    test.receive = function (request) {
      connectCount += 1;
      assert.equal(connectCount, 1);
      test.close();
    };
    var downlink = test.client.link(test.resolve('house/kitchen#light'), 'light/on');
    downlink.onClose = function () {
      done();
    };
  });

  it('should retry keepalive links that fail to connect', function (done) {
    var connectCount = 0;
    test.receive = function (request) {
      connectCount += 1;
      if (connectCount <= 2) {
        test.close();
      } else {
        assert(request.isLinkRequest);
        test.send(new proto.LinkedResponse(request.node, request.lane));
      }
    };
    var downlink = test.client.link(test.resolve('house/kitchen#light'), 'light/on', {keepAlive: true});
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
    test.receive = function (request) {
      connectCount += 1;
      assert.equal(connectCount, 1);
      assert(request.isLinkRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.close();
    };
    var downlink = test.client.link(test.resolve('house/kitchen#light'), 'light/on');
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
    test.receive = function (request) {
      assert(request.isLinkRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.close();
    };
    var downlink = test.client.link(test.resolve('house/kitchen#light'), 'light/on', {keepAlive: true});
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
    test.receive = function (request) {
      assert(request.isLinkRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.close();
    };
    var downlink = test.client.link(test.resolve('house/kitchen#light'), 'light/on');
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
    test.receive = function (request) {
      assert(request.isLinkRequest);
      test.send(new proto.LinkedResponse(request.node, request.lane));
      test.close();
    };
    var downlink = test.client.link(test.resolve('house/kitchen#light'), 'light/on');
    downlink.onLinked = function (response) {
      assert(downlink.isConnected);
    };
    downlink.onDisconnect = function (response) {
      assert(!downlink.isConnected);
      done();
    };
  });

  it('should return the authorization parameters of active links', function (done) {
    test.receive = function (request) {
      if (request.isAuthRequest) {
        test.send(new proto.AuthedResponse({id: 5678}));
      } else if (request.isLinkRequest) {
        test.send(new proto.LinkedResponse(request.node, request.lane));
        test.close();
      }
    };
    test.client.authorize(test.hostUri, {key: 1234});
    var downlink = test.client.link(test.resolve('house/kitchen#light'), 'light/on');
    downlink.onLinked = function (response) {
      assert(downlink.isAuthorized);
      assert.same(downlink.session, [{id: 5678}]);
    };
    downlink.onDisconnect = function (response) {
      assert(!downlink.isAuthorized);
      assert.equal(downlink.session, null);
      done();
    };
  });

  it('should close unlinked links', function (done) {
    test.receive = function (request) {
      assert(request.isLinkRequest);
      test.send(new proto.UnlinkedResponse(request.node, request.lane));
    };
    var downlink = test.client.link(test.resolve('house/kitchen#light'), 'light/on');
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
    test.receive = function (request) {
      assert(request.isLinkRequest);
      test.sendBytes(new Buffer(0));
      test.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var downlink = test.client.link(test.resolve('house/kitchen#light'), 'light/on');
    downlink.onLinked = function (response) {
      done();
    };
  });

  it('should ignore invalid envelopes', function (done) {
    test.receive = function (request) {
      assert(request.isLinkRequest);
      test.sendText('@foo');
      test.send(new proto.LinkedResponse(request.node, request.lane));
    };
    var downlink = test.client.link(test.resolve('house/kitchen#light'), 'light/on');
    downlink.onLinked = function (response) {
      done();
    };
  });

  it('should buffer a limited number of commands', function (done) {
    var receiveCount = 0;
    test.receive = function (message) {
      receiveCount += 1;
      assert(receiveCount <= 1024);
      if (receiveCount === 1024) setTimeout(done, 100);
    };
    for (var i = 0; i < 2048; i += 1) {
      test.client.command(test.resolve('house/kitchen#light'), 'light/on');
    }
  });
});
