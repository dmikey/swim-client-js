'use strict';

var config = require('./config.json');

var Client = require('./src/client');
var Scope = require('./src/scope');
var HostScope = require('./src/hostscope');
var LaneScope = require('./src/lanescope');
var Channel = require('./src/channel');

var DownlinkBuilder = require('./src/downlinkbuilder');
var Downlink = require('./src/downlink');
var LinkedDownlink = require('./src/linkeddownlink');
var SyncedDownlink = require('./src/synceddownlink');
var ListDownlink = require('./src/listdownlink');
var MapDownlink = require('./src/mapdownlink');
var NodeScope = require('./src/nodescope');

var swim = new Client();

swim.client = function (options) {
  return new Client(options);
};

swim.config = config;
swim.Client = Client;
swim.Scope = Scope;
swim.HostScope = HostScope;
swim.NodeScope = NodeScope;
swim.LaneScope = LaneScope;
swim.Channel = Channel;
swim.DownlinkBuilder = DownlinkBuilder;
swim.Downlink = Downlink;
swim.LinkedDownlink = LinkedDownlink;
swim.SyncedDownlink = SyncedDownlink;
swim.ListDownlink = ListDownlink;
swim.MapDownlink = MapDownlink;

module.exports = swim;