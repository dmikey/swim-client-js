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
      if (request.isLinkRequest && request.node === '/house#kitchen/light' && request.lane === 'light/on') {
        socket.send(new proto.EventMessage('/house#kitchen/light', 'light/on', undefined, record));
      }
    };
    swim.link(URI.resolve(endpoint, 'house#kitchen/light'), 'light/on', function (response) {
      assert.equal(response.node, '/house#kitchen/light');
      assert.equal(response.lane, 'light/on');
      assert.same(response.body, record);
      done();
    });
  });

  it('should unlink node lanes', function (done) {
    socket.receive = function (request) {
      if (request.isUnlinkRequest && request.node === '/house#kitchen/light' && request.lane === 'light/on') {
        done();
      }
    };
    var handler = function () {};
    swim.link(URI.resolve(endpoint, 'house#kitchen/light'), 'light/on', handler);
    swim.unlink(URI.resolve(endpoint, 'house#kitchen/light'), 'light/on', handler);
  });

  it('should send events', function (done) {
    var record = recon.parse('@switch { level: 100 }');
    socket.receive = function (message) {
      if (message.isEventMessage) {
        assert.equal(message.node, '/house#kitchen/light');
        assert.equal(message.lane, 'light/on');
        assert.same(message.body, record);
        done();
      }
    };
    swim.sendEvent(URI.resolve(endpoint, 'house#kitchen/light'), 'light/on', record);
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

  it('should get model nodes', function (done) {
    var record = recon.parse('@house { living: @room, dining: @room }');
    socket.receive = function (request) {
      if (request.isGetRequest && request.node === '/house') {
        socket.send(new proto.StateResponse('/house', record));
      }
    };
    swim.get(URI.resolve(endpoint, 'house'), function (response) {
      assert.equal(response.node, '/house');
      assert.same(response.body, record);
      done();
    });
  });

  it('should put model nodes', function (done) {
    var record = recon.parse('@house { living: @room, dining: @room }');
    socket.receive = function (request) {
      if (request.isPutRequest && request.node === '/house') {
        socket.send(new proto.StateResponse('/house', record));
      }
    };
    swim.put(URI.resolve(endpoint, 'house'), record, function (response) {
      assert.equal(response.node, '/house');
      assert.same(response.body, record);
      done();
    });
  });
});
