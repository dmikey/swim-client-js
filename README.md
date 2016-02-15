# Swim Client Javascript Implementation

## JavaScript Library

The Swim client library can run in any standard JavaScript environment.
Use `npm` to incorporate the library into Node.js projects.

```
npm install --save swim-client-js
```

```js
var swim = require('swim-client-js');
```

## JavaScript API

### Module

#### swim

The exported library module is also global `Client` instance.  Scripts can use
the global `swim` client to keep simple things simple.

```js
var swim = require('swim-client-js');
swim.command('ws://swim.example.com/chat/public', 'chat/post', 'Hello, world!');
```

#### swim.client([options])

Returns a `Client` object, which represents a dedicated connection pool.

- `options.maxReconnectTimeout`: maximum number of milliseconds to wait between
  reconnect attempts after exponential backoff.  Defaults to 30 seconds.
- `options.idleTimeout`: number of milliseconds to wait before closing a
  connection with no active links.  Defaults to 1 second.
- `options.sendBufferSize`: maximum number of commands to buffer while waiting
  for the network.  Defaults to 1,024 messages.

```js
var swim = require('swim-client-js');
var client = swim.client();
```

### Client

#### client.link(hostUri, nodeUri, laneUri, options)
#### client.link(hostUri, nodeUri, laneUri)
#### client.link(nodeUri, laneUri, options)
#### client.link(nodeUri, laneUri)

Returns a `Downlink` to a lane of a remote node.  If provided, `hostUri`
specifies the network endpoint to connect to, otherwise `nodeUri` must include
a network authority component.  The returned `Downlink` will receive events
as they're published on the linked lane of the remote node.

- `options.prio`: the desired priority of events on the link.  A priority is
  a floating point ranging value between `-1.0` and `1.0`, with `-1.0` being
  the lowest priority, `1.0` being the highest priority, and `0.0` being the
  default priority.  Events with higher priority are sent to the client before
  events with lower priority.
- `options.keepAlive`: whether or not to automatically re-establish the link
  after connection failures.  Defaults to `false`.

#### client.sync(hostUri, nodeUri, laneUri, options)
#### client.sync(hostUri, nodeUri, laneUri)
#### client.sync(nodeUri, laneUri, options)
#### client.sync(nodeUri, laneUri)

Returns a synchronized `Downlink` to a lane of a remote node.  If provided,
`hostUri` specifies the network endpoint to connect to, otherwise `nodeUri`
must include a network authority component.  The returned `Downlink` will
receive a dump of all events representing the current state of the linked lane,
and will continue receiving additional events as they're published.

- `options.prio`: the desired priority of events on the link.  A priority is
  a floating point ranging value between `-1.0` and `1.0`, with `-1.0` being
  the lowest priority, `1.0` being the highest priority, and `0.0` being the
  default priority.  Events with higher priority are sent to the client before
  events with lower priority.
- `options.keepAlive`: whether or not to automatically re-establish and
  re-synchronize the link after connection failures.  Defaults to `false`.

#### client.command(hostUri, nodeUri, laneUri, body)
#### client.command(nodeUri, laneUri, body)

Sends a command to a lane of a remote node.  If provided,`hostUri` specifies
the network endpoint to connect to, otherwise `nodeUri` must include a network
authority component.  `body` can be any JSON-compatible object; `body` is
serialized as [RECON](https://github.com/swimit/recon-js).

#### client.host(hostUri)

Returns a new `HostScope` object bound to the given `hostUri`.

#### client.node(hostUri, nodeUri)
#### client.node(nodeUri)

Returns a new `NodeScope` object bound to the given `nodeUri`.  If provided,
`hostUri` specifies the network endpoint to connect to, otherwise `nodeUri`
must include a network authority component.

#### client.lane(hostUri, nodeUri, laneUri)
#### client.lane(nodeUri, laneUri)

Returns a new `LaneScope` object bound to the given `laneUri` of the given
`nodeUri`.  If provided, `hostUri` specifies the network endpoint to connect
to, otherwise `nodeUri` must include a network authority component.

#### client.close()

Unlinks all active links, and closes all network connections, associated with
the client connection pool.

### HostScope

#### host.hostUri

Returns the URI of the remote host to which the scope is bound.

#### host.link(nodeUri, laneUri, options)
#### host.link(nodeUri, laneUri)

Returns a `Downlink` to a lane of a node on the remote host to which this
scope is bound.  Registers the returned downlink with the scope to ensure that
the link is cleaned up when the scope closes.

#### host.sync(nodeUri, laneUri, options)
#### host.sync(nodeUri, laneUri)

Returns a synchronized `Downlink` to a lane of a node on the remote host to
which this scope is bound.  Registers the returned downlink with the scope to
ensure that the link is cleaned up when the scope closes.

#### host.command(nodeUri, laneUri, body)

Sends a command to a lane of a node on the remote host to which this scope is bound.

#### host.node(nodeUri)

Returns a new `NodeScope` object bound to the given `nodeUri` on the remote
`hostUri` to which this scope is bound.

#### host.lane(nodeUri, laneUri)

Returns a new `LaneScope` object bound to the given `laneUri` of the given
`nodeUri` on the remote `hostUri` to which this scope is bound.

#### host.close()

Unlinks all active links registered with the scope.

### NodeScope

#### node.hostUri

Returns the URI of the remote host to which the scope is bound.

#### node.nodeUri

Returns the URI of the remote node to which the scope is bound.  Returns an
absolute URI resolved against the `hostUri`.

#### node.link(laneUri, options)
#### node.link(laneUri)

Returns a `Downlink` to a lane of the remote node to which this scope is bound.
Registers the returned downlink with the scope to ensure that the link is
cleaned up when the scope closes.

#### node.sync(laneUri, options)
#### node.sync(laneUri)

Returns a synchronized `Downlink` to a lane of the remote node to which this
scope is bound.  Registers the returned downlink with the scope to ensure that
the link is cleaned up when the scope closes.

#### node.command(laneUri, body)

Sends a command to a lane of the remote node to which this scope is bound.

#### node.lane(laneUri)

Returns a new `LaneScope` object bound to the given `laneUri` of the `nodeUri`
and the `hostUri` to which this scope is bound.

#### node.close()

Unlinks all active links registered with the scope.

### LaneScope

#### lane.hostUri

Returns the URI of the remote host to which the scope is bound.

#### lane.nodeUri

Returns the URI of the remote node to which the scope is bound.  Returns an
absolute URI resolved against the `hostUri`.

#### lane.laneUri

Returns the URI of the lane to which the scope is bound.

#### lane.link(options)
#### lane.link()

Returns a `Downlink` to the remote lane to which this scope is bound.
Registers the returned downlink with the scope to ensure that the link is
cleaned up when the scope closes.

#### lane.sync(laneUri, options)
#### lane.sync(laneUri)

Returns a synchronized `Downlink` to the remote lane to which this scope is
bound.  Registers the returned downlink with the scope to ensure that the link
is cleaned up when the scope closes.

#### lane.command(body)

Sends a command to the remote lane to which this scope is bound.

#### lane.close()

Unlinks all active links registered with the scope.

### Downlink

#### downlink.hostUri

Returns the URI containing the network authority of the downlink.

#### downlink.nodeUri

Returns the URI of the remote node to which this link is connected.  Returns
an absolute URI resolved against the `hostUri`.

#### downlink.laneUri

Returns the URI of the lane to which this link is connected.

#### downlink.options

Returns the `options` object provided when the link was created.

#### downlink.prio

Returns the floating point priority level of the link.

#### downlink.keepAlive[ = keepAlive]

Returns `true` if the link should be automatically re-established after
connection failures.  The keepAlive mode can be changed at any time by
assigning a new value to this property.

#### downlink.connected

Returns `true` if the link is currently connected.

#### downlink.delegate[ = delegate]

Returns the object on which to invoke event callbacks.  Defaults to the
`downlink` object itself.  The event delegate can be changed by assigning a
new object to this property.

#### downlink.close()

Unregisters the downlink so that it no longer receives events.  If this was the
only active link to a particular remote lane, the link will be unlinked.

### Downlink Events

Downlink callbacks are invoked on the `delegate` member of a `Downlink` object.
By default, a `Downlink` is its own delegate, so callbacks can be assigned
directly to the downlink object.  If `delegate` is reassigned, then callbacks
will instead by invoked on the given `delegate` object.

#### downlink.onEvent = function (message) {}

The `onEvent` callback gets invoked every time the downlink receives an event.

- `message.nodeUri`: the URI of the remote node that published the event.
- `message.laneUri`: the URI of the lane that published the event.
- `message.body`: the plain old JavaScript value of the event, decoded from RECON.

#### downlink.onLink = function (request) {}

The `onLink` callback gets invoked when the downlink is about to send a `@link`
request to the remote host to establish a new link.

- `request.nodeUri`: the URI of the remote node to link.
- `request.laneUri`: the URI of the lane to link.
- `request.prio`: the requested priority of the link.
- `request.body`: an optional request body to send to the remote lane.

#### downlink.onLinked = function (response) {}

The `onLinked` callback gets invoked when the downlink receives a `@linked`
response from the remote host, indicating the link has been established.

- `response.nodeUri`: the URI of the linked remote node.
- `response.laneUri`: the URI of the linked lane.
- `response.prio`: the established priority of the link.
- `response.body`: an optional response body sent by the remote lane.

#### downlink.onSync = function (request) {}

The `onSync` callback gets invoked when the downlink is about to send a `@sync`
request to the remote host to establish a new link and synchronize its state.

- `request.nodeUri`: the URI of the remote node to sync.
- `request.laneUri`: the URI of the lane to sync.
- `request.prio`: the requested priority of the link.
- `request.body`: an optional request body to send to the remote lane.

#### downlink.onSynced = function (response) {}

The `onSynced` callback gets invoked when the downlink receives a `@synced`
response from the remote host, indicating that the link has finished sending
its initial state events.

- `response.nodeUri`: the URI of the synced remote node.
- `response.laneUri`: the URI of the synced lane.
- `response.body`: an optional response body sent by the remote lane.

#### downlink.onUnlink = function (request) {}

The `onUnlink` callback gets invoked when the downlink is about to send an
`@unlink` request to the remote host in order to teardown a previously
established link.  This happens when the client calls `downlink.close()` on
the only active link to a particular remote lane.

- `request.nodeUri`: the URI of the remote node to unlink.
- `request.laneUri`: the URI of the lane to unlink.
- `request.body`: an optional request body to send to the remote lane.

#### downlink.onUnlinked = function (response) {}

The `onUnlinked` callback gets invoked when the downlink receives an `@unlinked`
response from the remote host.  This indicates that the remote host has
rejected the link.  The link will now close, regardless of whether
`downlink.keepAlive` is `true` or not.

- `response.nodeUri`: the URI of the unlinked remote node.
- `response.laneUri`: the URI of the unlinked lane.
- `response.body`: an optional response body sent by the remote lane, which may
  indicate the cause of the unlink.

#### downlink.onConnect = function () {}

The `onConnect` callback gets invoked when the network connection that carries
the link is connected.

#### downlink.onDisconnect = function () {}

The `onDisconnect` callback gets invoked when the network connection that
carries the link is disconnected.

#### downlink.onError = function () {}

The `onError` callback gets invoked when the network connection that carries
the link signals an error.  Unfortunately, the underlying network APIs don't
provide any detail on network errors.  Errors always cause the underlying
network connection to close; `keepAlive` links will automatically reconnect
after network errors.

#### downlink.onClose = function () {}

The `onClose` callback gets invoked when the downlink has been disconnected and
will not be reconnected.  This happens when the client calls `downlink.close()`,
or when the link is explicityly `@unlinked` by the remote host, or when the
network connection that carries a non-`keepAlive` link gets disconnected.
