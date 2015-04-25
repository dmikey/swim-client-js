'use strict';
/* global describe: false */
/* global it: false */
/* global beforeEach: false */
/* global afterEach: false */

var assert = require('assert');
var http = require('http');
var WS = require('websocket');
var URI = require('uri-js');
var recon = require('recon-js');
var proto = require('swim-proto-js');
var swim = require('./swim-client.js');

assert.same = function (x, y) {
  if (!recon.compare(x, y))
    assert.fail(false, true, recon.stringify(x) +' did not equal '+ recon.stringify(y));
};


describe('SWIM client', function () {
  this.timeout(5000);
  this.slow(5000);

  var httpServer, wsServer, connection, socket;
  var endpoint = 'http://localhost:8009';

  beforeEach(function (done) {
    httpServer = http.createServer();
    httpServer.listen(8009, function () {
      done();
    });
    wsServer = new WS.server({
      httpServer: httpServer
    });
    socket = {};
    wsServer.on('request', function (request) {
      var connection = request.accept('swim-0.0', request.origin);
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
    if (connection) connection.close();
    wsServer.shutDown();
    httpServer.close(function () {
      socket = undefined;
      connection = undefined;
      wsServer = undefined;
      httpServer = undefined;
      swim.reset();
      done();
    });
  });

  it('should link node lanes', function (done) {
    var record = recon.parse('@switch { level: 100 }');
    socket.receive = function (request) {
      if (request.isLinkRequest && request.node === '/house/kitchen#light' && request.lane === 'light/on') {
        socket.send(new proto.LinkedResponse(request.node, request.lane));
        socket.send(new proto.EventMessage('/house/kitchen#light', 'light/on', undefined, record));
      }
    };
    swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', function (response) {
      assert.equal(response.node, '/house/kitchen#light');
      assert.equal(response.lane, 'light/on');
      assert.same(response.body, record);
      done();
    });
  });

  it('should unlink node lanes', function (done) {
    var record = recon.parse('@switch { level: 100 }');
    var linkCount = 0;
    socket.receive = function (request) {
      if (request.isLinkRequest) {
        linkCount += 1;
        socket.send(new proto.LinkedResponse(request.node, request.lane));
        if (linkCount === 2) socket.send(new proto.EventMessage('/house/bedroom#light', 'light/on', undefined, record));
      }
      else if (request.isUnlinkRequest) {
        linkCount -= 1;
        if (linkCount === 0) done();
      }
    };
    var handle1 = {};
    var handle2 = {};
    var handle3 = {};
    function handle4() {
      swim.unlink(URI.resolve(endpoint, '/house/bedroom#light'), 'light/on', handle4);
      swim.unlink(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', handle2);
      swim.unlink(URI.resolve(endpoint, '/house/kitchen#light'), 'light/off', handle3);
      swim.unlink(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', function () {}); // Ignored
      swim.unlink(URI.resolve(endpoint, '/house/kitchen'), 'light/off', handle1); // Ignored
      swim.unlink(URI.resolve(endpoint, '/house/kitchen#light'), 'light/off', handle1); // Ignored
      swim.unlink(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', handle1);
    }
    swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', handle1);
    swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', handle2);
    swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light/off', handle3);
    swim.link(URI.resolve(endpoint, '/house/bedroom#light'), 'light/on', handle4);
  });

  it('should handle coincident links', function (done) {
    var record = recon.parse('@switch { level: 100 }');
    var linkCount = 0;
    var eventCount = 0;
    socket.receive = function (request) {
      if (request.isLinkRequest) {
        socket.send(new proto.LinkedResponse(request.node, request.lane));
      }
    };
    function onEvent() {
      eventCount += 1;
      if (eventCount === 3) done();
    }
    function onLinked() {
      linkCount += 1;
      if (linkCount === 2) swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', handle3);
      else if (linkCount === 3) socket.send(new proto.EventMessage('/house/kitchen#light', 'light/on', undefined, record));
    }
    var handle1 = {
      onEvent: onEvent,
      onLinked: onLinked
    };
    var handle2 = {
      onEvent: onEvent,
      onLinked: onLinked
    };
    var handle3 = {
      onEvent: onEvent,
      onLinked: onLinked
    };
    swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', handle1);
    swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', handle2);
  });

  it('should connect pending links', function (done) {
    var connectionCount = 0;
    socket.receive = function (request) {
      if (connectionCount === 0) {
        socket.close();
        connectionCount += 1;
      }
      else if (request.isLinkRequest) {
        socket.send(new proto.LinkedResponse(request.node, request.lane));
      }
    };
    var handle = {
      onLinked: function () {
        swim.unlink(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', handle);
        done();
      }
    };
    swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', handle);
  });

  it('should reconnect broken links', function (done) {
    var connectionCount = 0;
    socket.receive = function (request) {
      if (request.isLinkRequest) {
        socket.send(new proto.LinkedResponse(request.node, request.lane));
        if (connectionCount === 0) {
          socket.close();
          connectionCount += 1;
        }
      }
    };
    var state = 0;
    var handle = {
      onLinked: function () {
        assert.equal(state, 0);
        state = 1;
      },
      onBroken: function () {
        assert.equal(state, 1);
        state = 2;
      },
      onUnbroken: function () {
        assert.equal(state, 2);
        swim.unlink(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', handle);
        done();
      }
    };
    swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', handle);
  });

  it('should fail rejected links', function (done) {
    socket.receive = function (request) {
      if (request.isLinkRequest) {
        socket.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var handle = {
      onFailed: function () {
        done();
      }
    };
    swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', handle);
  });

  it('should handle unlinks', function (done) {
    socket.receive = function (request) {
      if (request.isLinkRequest) {
        socket.send(new proto.LinkedResponse(request.node, request.lane));
        socket.send(new proto.UnlinkedResponse(request.node, request.lane));
      }
    };
    var handle = {
      onUnlinked: function () {
        done();
      }
    };
    swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', handle);
  });

  it('should receive child lane events', function (done) {
    var record = recon.parse('@switch { level: 100 }');
    socket.receive = function (request) {
      if (request.isLinkRequest && request.node === '/house/kitchen#light' && request.lane === 'light') {
        socket.send(new proto.LinkedResponse(request.node, request.lane));
        socket.send(new proto.EventMessage('/house/kitchen#light', 'light/on?foo#bar', undefined, record));
      }
    };
    swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light', function (response) {
      assert.equal(response.node, '/house/kitchen#light');
      assert.equal(response.lane, 'light/on?foo#bar');
      assert.same(response.body, record);
      done();
    });
  });

  it('should receive child lane commands', function (done) {
    var record = recon.parse('@switch { level: 100 }');
    socket.receive = function (request) {
      if (request.isLinkRequest && request.node === '/house/kitchen#light' && request.lane === 'light') {
        socket.send(new proto.LinkedResponse(request.node, request.lane));
        socket.send(new proto.CommandMessage('/house/kitchen#light', 'light/on?foo#bar', undefined, record));
      }
    };
    swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light', function (response) {
      assert.equal(response.node, '/house/kitchen#light');
      assert.equal(response.lane, 'light/on?foo#bar');
      assert.same(response.body, record);
      done();
    });
  });

  it('should ignore non-text frames', function (done) {
    socket.receive = function (request) {
      if (request.isLinkRequest && request.node === '/house/kitchen#light' && request.lane === 'light') {
        socket.sendBytes(new Buffer(0));
        socket.send(new proto.LinkedResponse(request.node, request.lane));
      }
    };
    var handle = {
      onLinked: function (envelope) {
        done();
      }
    };
    swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light', handle);
  });

  it('should ignore invalid envelopes', function (done) {
    socket.receive = function (request) {
      if (request.isLinkRequest && request.node === '/house/kitchen#light' && request.lane === 'light') {
        socket.sendText('@foo');
        socket.send(new proto.LinkedResponse(request.node, request.lane));
      }
    };
    var handle = {
      onLinked: function (envelope) {
        done();
      }
    };
    swim.link(URI.resolve(endpoint, '/house/kitchen#light'), 'light', handle);
  });

  it('should send events', function (done) {
    var record = recon.parse('@switch { level: 100 }');
    socket.receive = function (message) {
      if (message.isEventMessage) {
        assert.equal(message.node, '/house/kitchen#light');
        assert.equal(message.lane, 'light/on');
        assert.same(message.body, record);
        done();
      }
    };
    swim.sendEvent(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', record);
  });

  it('should send commands', function (done) {
    var record = recon.parse('@switch { level: 0 }');
    socket.receive = function (message) {
      if (message.isCommandMessage) {
        assert.equal(message.node, '/house');
        assert.equal(message.lane, 'light/off');
        assert.same(message.body, record);
        done();
      }
    };
    swim.sendCommand(URI.resolve(endpoint, 'house'), 'light/off', record);
  });

  it('should buffer a limited number of sends', function (done) {
    var record = recon.parse('@switch { level: 100 }');
    socket.receive = function (message) {};
    for (var i = 0; i < 2048; i += 1) {
      swim.sendEvent(URI.resolve(endpoint, '/house/kitchen#light'), 'light/on', record);
    }
    done(); // TODO: Verify dropped frames
  });

  it('should get node models', function (done) {
    var record = recon.parse('@house { living: @room, dining: @room }');
    socket.receive = function (request) {
      if (request.isGetRequest && request.node === '/house') {
        socket.send(new proto.StateResponse('/house', record));
      }
    };
    swim.get(URI.resolve(endpoint, '/house'), function (response) {
      assert.equal(response.node, '/house');
      assert.same(response.body, record);
      done();
    });
  });

  it('should put node models', function (done) {
    var record = recon.parse('@house { living: @room, dining: @room }');
    var putCount = 0;
    socket.receive = function (request) {
      if (request.isPutRequest && request.node === '/house') {
        socket.send(new proto.StateResponse('/house', record));
        if (putCount === 0) swim.put(URI.resolve(endpoint, '/house'), record, function (response) {
          done();
        });
        putCount += 1;
      }
    };
    swim.put(URI.resolve(endpoint, '/house'), record);
  });
});
