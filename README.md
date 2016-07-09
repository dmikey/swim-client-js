# Swim Client Javascript Implementation

[![Build Status](https://travis-ci.org/swimit/swim-client-js.svg?branch=master)](https://travis-ci.org/swimit/swim-client-js) [![Coverage Status](https://coveralls.io/repos/swimit/swim-client-js/badge.svg?branch=master)](https://coveralls.io/r/swimit/swim-client-js?branch=master)

The Swim JavaScript client makes it easy to build web apps that connect
seamlessly to ultra responsive, highly scalable
[Swim services](https://github.com/swimit/swim) running in the cloud.

To get started writing reactive Swim services, check out the
[SwimJS](https://github.com/swimit/swimjs) server runtime.

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

The exported library module is also global [Client](#client) instance.
Scripts can use the global `swim` client to keep simple things simple.

```js
var swim = require('swim-client-js');
var users = swim.syncMap('ws://swim.example.com/chat/public', 'chat/users');
```

#### swim.client([options])

Returns a [Client](#client) object, which represents a dedicated connection pool.

- `options.maxReconnectTimeout`: maximum number of milliseconds to wait between
  reconnect attempts after exponential backoff.  Defaults to 30 seconds.
- `options.idleTimeout`: number of milliseconds to wait before closing a
  connection with no active links.  Defaults to 1 second.
- `options.backpressureTimeout`: number of milliseconds to wait before checking
  a connection with a full send buffer.  Defaults to 100 milliseconds.
- `options.sendBufferSize`: number of bytes in a connection's send buffer above
  which to trigger a backpressure timeout.  Defaults to 32kB.
- `options.commandQueueLength`: maximum number of commands to buffer while waiting
  for the network.  Defaults to 1,024 messages.

```js
var swim = require('swim-client-js');
var client = swim.client();
```

### Client

#### client.authorize(hostUri, credentials)

Authorizes all connections to `hostUri` through `client` with the provided
`credentials` object.  `credentials` might contain, for example, a
[Google Sign-In ID token](https://developers.google.com/identity/sign-in/web/).
Note that connections to public hosts may not require authorization.

#### client.downlink()

Returns a new [DownlinkBuilder](#downlinkbuilder), used to establish a new
link to a lane of some remote node.

#### client.link([hostUri, ]nodeUri, laneUri[, options])

Returns a [Downlink](#downlink) to a lane of a remote node.  If provided,
`hostUri` specifies the network endpoint to connect to, otherwise `nodeUri`
must include a network authority component.  The returned `Downlink` will
receive events as they're published on the linked lane of the remote node.

- `options.prio`: the desired priority of events on the link.  A priority is
  a floating point ranging value between `-1.0` and `1.0`, with `-1.0` being
  the lowest priority, `1.0` being the highest priority, and `0.0` being the
  default priority.  Events with higher priority are sent to the client before
  events with lower priority.
- `options.keepAlive`: whether or not to automatically re-establish the link
  after connection failures.  Defaults to `false`.

#### client.sync([hostUri, ]nodeUri, laneUri[, options])

Returns a synchronized [Downlink](#downlink) to a lane of a remote node.  If
provided, `hostUri` specifies the network endpoint to connect to, otherwise
`nodeUri` must include a network authority component.  The returned `Downlink`
will receive a dump of all events representing the current state of the linked
lane, and will continue receiving additional events as they're published.

- `options.prio`: the desired priority of events on the link.  A priority is
  a floating point ranging value between `-1.0` and `1.0`, with `-1.0` being
  the lowest priority, `1.0` being the highest priority, and `0.0` being the
  default priority.  Events with higher priority are sent to the client before
  events with lower priority.
- `options.keepAlive`: whether or not to automatically re-establish and
  re-synchronize the link after connection failures.  Defaults to `false`.

#### client.syncList([hostUri, ]nodeUri, laneUri[, options])

Returns a [ListDownlink](#listdownlink) that synchronizes its state with a
remote ordered list lane.

- `options.prio`: the desired priority of events on the link.  A priority is
  a floating point ranging value between `-1.0` and `1.0`, with `-1.0` being
  the lowest priority, `1.0` being the highest priority, and `0.0` being the
  default priority.  Events with higher priority are sent to the client before
  events with lower priority.
- `options.keepAlive`: whether or not to automatically re-establish and
  re-synchronize the link after connection failures.  Defaults to `false`.

#### client.syncMap([hostUri, ]nodeUri, laneUri[, options])

Returns a [MapDownlink](#mapdownlink) that synchronizes its state with a remote
map lane.

- `options.primaryKey`: function that derives keys from message values, or a
  dot-notation string that specifies the path of the primary key.  Defaults to
  the identity function.
- `options.sortBy`: function with which to sort downlinked map state, or a
  dot-notation string that specifies the path of a value to sort by.  Defaults
  to `undefined`, which leaves the downlinked map state unsorted.
- `options.prio`: the desired priority of events on the link.  A priority is
  a floating point ranging value between `-1.0` and `1.0`, with `-1.0` being
  the lowest priority, `1.0` being the highest priority, and `0.0` being the
  default priority.  Events with higher priority are sent to the client before
  events with lower priority.
- `options.keepAlive`: whether or not to automatically re-establish and
  re-synchronize the link after connection failures.  Defaults to `false`.

#### client.command([hostUri, ]nodeUri, laneUri, body)

Sends a command to a lane of a remote service.  If provided, `hostUri`
specifies the network endpoint of the service to command, otherwise `nodeUri`
must itself contain a network authority component.  `nodeUri` identifies the
particular service instance to command.  `body` is the command to send, and
can be any JSON-compatible object; `body` is serialized as a
[RECON](https://github.com/swimit/recon-js) structure.

#### client.host(hostUri)

Returns a new [HostScope](#hostscope) object bound to the endpoint at the
given `hostUri`.

#### client.node([hostUri, ]nodeUri)

Returns a new [NodeScope](#nodescope) object bound to the service at the given
`nodeUri`.  If provided, `hostUri` specifies the network endpoint to connect
to, otherwise `nodeUri` must contain a network authority component.

#### client.lane([hostUri, ]nodeUri, laneUri)

Returns a new [LaneScope](#lanescope) object bound to the given `laneUri` of
the service at the given `nodeUri`.  If provided, `hostUri` specifies the
network endpoint to connect to, otherwise `nodeUri` must contain a network
authority component.

#### client.close()

Unlinks all downlinks, and closes all network connections, associated with
the `client` connection pool.

### Client Callbacks

Client callbacks are invoked on the `delegate` member of a `Client` object.
By default, a `Client` is its own delegate, so callbacks can be assigned
directly to the client object.  If `delegate` is reassigned, then callbacks
will instead by invoked on the assigned `delegate` object.

#### client.onConnect = function (info)

The `onConnect` callback gets invoked when a network connection managed by the
`client` is connected.

- `info.hostUri`: the URI of the host that connected.

#### client.onDisconnect = function (info)

The `onConnect` callback gets invoked when a network connection managed by the
`client` is disconnected.

- `info.hostUri`: the URI of the host that disconnected.

#### client.onError = function (info)

The `onError` callback gets invoked when a network connection managed by the
`client` encounters an error.

- `info.hostUri`: the URI of the host that disconnected.

#### client.onAuthorize = function (info)

The `onAuthorize` callback gets invoked when a network connection managed by
the `client` is successfully authorized by the remote host.

- `info.hostUri`: the URI of the authorized host.
- `info.session`: the authorization parameters returned by the remote host.

#### client.onDeauthorize = function (info)

The `onDeauthorize` callback gets invoked when a network connection managed by
the `client` is deauthorized by the remote host, or when the host rejects an
authorization request.

- `info.hostUri`: the URI of the deauthorized host.
- `info.session`: the authorization parameters returned by the remote host.

### Scope

A `Scope` object monitors the lifecycle of [downlinks](#downlink) created
through the scope.

- [HostScope](#hostscope): manages a set of downlinks to a particular remote `hostUri`.
- [NodeScope](#nodescope): manages a set of downlinks to a particular remote `nodeUri`.
- [LaneScope](#lanescope): manages a set of downlinks to a particular `laneUri`
  of some remote `nodeUri`.

#### scope.isConnected

Returns `true` if there is an active network connection to this scope's remote host.

#### scope.isAuthorized

Returns `true` if the network connection to this scope's remote host has been
successfully authorized.

#### scope.session

Returns the authorization parameters provided by the remote host, if the
client was explicitly authorized by the host.  Returns `null` if the connection
is closed, or if the connection is open but not authorized.

#### scope.close()

Unlinks all downlinks registered with the scope.

### Scope Callbacks

Scope callbacks are invoked on the `delegate` member of a `Scope` object.
By default, a `Scope` is its own delegate, so callbacks can be assigned
directly to the scope object.  If `delegate` is reassigned, then callbacks
will instead by invoked on the assigned `delegate` object.

#### scope.onConnect = function (info)

The `onConnect` callback gets invoked when a network connection to the scope's
remote host is connected.

- `info.hostUri`: the URI of the host that connected.

#### scope.onDisconnect = function (info)

The `onConnect` callback gets invoked when a network connection to the scope's
remote host is disconnected.

- `info.hostUri`: the URI of the host that disconnected.

#### scope.onError = function (info)

The `onError` callback gets invoked when a network connection to the scope's
remote host encounters an error.

- `info.hostUri`: the URI of the host that disconnected.

#### scope.onAuthorize = function (info)

The `onAuthorize` callback gets invoked when a network connection to the scope's
remote host is successfully authorized by the host.

- `info.hostUri`: the URI of the authorized host.
- `info.session`: the authorization parameters returned by the remote host.

#### scope.onDeauthorize = function (info)

The `onDeauthorize` callback gets invoked when a network connection to the
scope's remote host is deauthorized by the host, or when the host rejects an
authorization request.

- `info.hostUri`: the URI of the deauthorized host.
- `info.session`: the authorization parameters returned by the remote host.

### HostScope

`HostScope` extends the [Scope](#scope) interface.

#### host.hostUri

Returns the URI of the network endpoint to which the scope is bound.

#### host.authorize(credentials)

Authorizes connections to the host to which this scope is bound using the
provided `credentials` object.

#### host.downlink()

Returns a new [DownlinkBuilder](#downlinkbuilder) for constructing a link to
a lane of a node on the remote host to which this scope is bound.

#### host.link(nodeUri, laneUri[, options])

Returns a [Downlink](#downlink) to a lane of a node on the remote host to which
this scope is bound.  Registers the returned downlink with the scope to ensure
that the link is cleaned up when the scope closes.

#### host.sync(nodeUri, laneUri[, options])

Returns a synchronized [Downlink](#downlink) to a lane of a node on the remote
host to which this scope is bound.  Registers the returned downlink with the
scope to ensure that the link is cleaned up when the scope closes.

#### host.syncList(nodeUri, laneUri[, options])

Returns a [ListDownlink](#listdownlink) that synchronizes its state with an
ordered list lane of a node on the remote host to which this scope is bound.
Registers the returned downlink with the scope to ensure that the link is
cleaned up when the scope closes.

#### host.syncMap(nodeUri, laneUri[, options])

Returns a [MapDownlink](#mapdownlink) that synchronizes its state with a map
lane of a node on the remote host to which this scope is bound.  Registers the
returned downlink with the scope to ensure that the link is cleaned up when
the scope closes.

#### host.command(nodeUri, laneUri, body)

Sends a command to a lane of a node on the remote host to which this scope is bound.

#### host.node(nodeUri)

Returns a new [NodeScope](#nodescope) object bound to the given `nodeUri` on the remote
`hostUri` to which this scope is bound.

#### host.lane(nodeUri, laneUri)

Returns a new [LaneScope](#lanescope) object bound to the given `laneUri` of
the given `nodeUri` on the remote `hostUri` to which this scope is bound.

#### host.close()

Unlinks all downlinks registered with the scope.

### NodeScope

`NodeScope` extends the [Scope](#scope) interface.

#### node.hostUri

Returns the URI of the remote host to which the scope is bound.

#### node.nodeUri

Returns the URI of the remote node to which the scope is bound.  Returns an
absolute URI resolved against the `hostUri`.

#### node.downlink()

Returns a new [DownlinkBuilder](#downlinkbuilder) for constructing a link to
a lane of the remote node to which this scope is bound.

#### node.link(laneUri[, options])

Returns a [Downlink](#downlink) to a lane of the remote node to which this
scope is bound.  Registers the returned downlink with the scope to ensure that
the link is cleaned up when the scope closes.

#### node.sync(laneUri[, options])

Returns a synchronized [Downlink](#downlink) to a lane of the remote node to
which this scope is bound.  Registers the returned downlink with the scope to
ensure that the link is cleaned up when the scope closes.

#### node.syncList(laneUri[, options])

Returns a [ListDownlink](#listdownlink) that synchronizes its state with an
ordered list lane of the remote node to which this scope is bound.  Registers
the returned downlink with the scope to ensure that the link is cleaned up
when the scope closes.

#### node.syncMap(laneUri[, options])

Returns a [MapDownlink](#mapdownlink) that synchronizes its state with a map
lane of the remote node to which this scope is bound.  Registers the returned
downlink with the scope to ensure that the link is cleaned up when the scope
closes.

#### node.command(laneUri, body)

Sends a command to a lane of the remote node to which this scope is bound.

#### node.lane(laneUri)

Returns a new [LaneScope](#lanescope) object bound to the given `laneUri` of
the `nodeUri` and the `hostUri` to which this scope is bound.

#### node.close()

Unlinks all downlinks registered with the scope.

### LaneScope

`LaneScope` extends the [Scope](#scope) interface.

#### lane.hostUri

Returns the URI of the remote host to which the scope is bound.

#### lane.nodeUri

Returns the URI of the remote node to which the scope is bound.  Returns an
absolute URI resolved against the `hostUri`.

#### lane.laneUri

Returns the URI of the lane to which the scope is bound.

#### lane.downlink()

Returns a new [DownlinkBuilder](#downlinkbuilder) for constructing a link to
the remote lane to which this scope is bound.

#### lane.link([options])

Returns a [Downlink](#downlink) to the remote lane to which this scope is
bound.  Registers the returned downlink with the scope to ensure that the link
is cleaned up when the scope closes.

#### lane.sync([options])

Returns a synchronized [Downlink](#downlink) to the remote lane to which this
scope is bound.  Registers the returned downlink with the scope to ensure that
the link is cleaned up when the scope closes.

#### lane.syncList([options])

Returns a [ListDownlink](#listdownlink) that synchronizes its state with the
remote ordered list lane to which this scope is bound.  Registers the returned
downlink with the scope to ensure that the link is cleaned up when the scope
closes.

#### lane.syncMap([options])

Returns a [MapDownlink](#mapdownlink) that synchronizes its state with the
remote map lane to which this scope is bound.  Registers the returned downlink
with the scope to ensure that the link is cleaned up when the scope closes.

#### lane.command(body)

Sends a command to the remote lane to which this scope is bound.

#### lane.close()

Unlinks all downlinks registered with the scope.

### Downlink

#### downlink.hostUri

Returns the URI of the host to which `downlink` connects.

#### downlink.nodeUri

Returns the URI of the remote node to which `downlink` connects.  Returns an
absolute URI resolved against the `hostUri`.

#### downlink.laneUri

Returns the URI of the lane to which `downlink` connects.

#### downlink.options

Returns the `options` object provided when `downlink` was created.

#### downlink.prio

Returns the floating point priority level of the `downlink`.

#### downlink.keepAlive[ = keepAlive]

Returns `true` if the link should be automatically re-established after
connection failures.  The keepAlive mode can be changed at any time by
assigning a new value to this property.

#### downlink.isConnected

Returns `true` if the link is currently connected.

#### downlink.isAuthorized

Returns `true` if the network connection carrying the link has been explicitly
authorized.  Note that not all links require authorization.

#### downlink.session

Returns the authorization parameters of the network connection carrying this
link, if the link was explicitly authorized by the remote host.  Returns `null`
if the link is disconnected, or if the link is connected but not authorized.

#### downlink.delegate[ = delegate]

Returns the object on which to invoke event callbacks.  Defaults to the
`downlink` object itself.  The event delegate can be changed by assigning a
new object to this property.

#### downlink.command(body)

Sends a command to the remote lane to which this downlink is connected.

#### downlink.close()

Unregisters the downlink so that it no longer receives events.  If this was the
only active link to a particular remote lane, the link will be unlinked.

### Downlink Callbacks

Downlink callbacks are invoked on the `delegate` member of a `Downlink` object.
By default, a `Downlink` is its own delegate, so callbacks can be assigned
directly to the downlink object.  If `delegate` is reassigned, then callbacks
will instead by invoked on the assigned `delegate` object.

#### downlink.onEvent = function (message)

The `onEvent` callback gets invoked every time the downlink receives an event.

- `message.nodeUri`: the URI of the remote node that published the event.
- `message.laneUri`: the URI of the lane that published the event.
- `message.body`: the plain old JavaScript value of the event, decoded from RECON.

#### downlink.onLink = function (request)

The `onLink` callback gets invoked when the downlink is about to send a `@link`
request to the remote host to establish a new link.

- `request.nodeUri`: the URI of the remote node to link.
- `request.laneUri`: the URI of the lane to link.
- `request.prio`: the requested priority of the link.
- `request.body`: an optional request body to send to the remote lane.

#### downlink.onLinked = function (response)

The `onLinked` callback gets invoked when the downlink receives a `@linked`
response from the remote host, indicating the link has been established.

- `response.nodeUri`: the URI of the linked remote node.
- `response.laneUri`: the URI of the linked lane.
- `response.prio`: the established priority of the link.
- `response.body`: an optional response body sent by the remote lane.

#### downlink.onSync = function (request)

The `onSync` callback gets invoked when the downlink is about to send a `@sync`
request to the remote host to establish a new link and synchronize its state.

- `request.nodeUri`: the URI of the remote node to sync.
- `request.laneUri`: the URI of the lane to sync.
- `request.prio`: the requested priority of the link.
- `request.body`: an optional request body to send to the remote lane.

#### downlink.onSynced = function (response)

The `onSynced` callback gets invoked when the downlink receives a `@synced`
response from the remote host, indicating that the link has finished sending
its initial state events.

- `response.nodeUri`: the URI of the synced remote node.
- `response.laneUri`: the URI of the synced lane.
- `response.body`: an optional response body sent by the remote lane.

#### downlink.onUnlink = function (request)

The `onUnlink` callback gets invoked when the downlink is about to send an
`@unlink` request to the remote host in order to teardown a previously
established link.  This happens when the client calls `downlink.close()` on
the only active link to a particular remote lane.

- `request.nodeUri`: the URI of the remote node to unlink.
- `request.laneUri`: the URI of the lane to unlink.
- `request.body`: an optional request body to send to the remote lane.

#### downlink.onUnlinked = function (response)

The `onUnlinked` callback gets invoked when the downlink receives an `@unlinked`
response from the remote host.  This indicates that the remote host has
rejected the link.  The link will now close, regardless of whether
`downlink.keepAlive` is `true` or not.

- `response.nodeUri`: the URI of the unlinked remote node.
- `response.laneUri`: the URI of the unlinked lane.
- `response.body`: an optional response body sent by the remote lane, which may
  indicate the cause of the unlink.

#### downlink.onConnect = function ()

The `onConnect` callback gets invoked when the network connection that carries
the link is connected.

#### downlink.onDisconnect = function ()

The `onDisconnect` callback gets invoked when the network connection that
carries the link is disconnected.

#### downlink.onError = function ()

The `onError` callback gets invoked when the network connection that carries
the link encounters an error.  Unfortunately, the underlying network APIs
don't provide any detail on network errors.  Errors always cause the underlying
network connection to close; `keepAlive` links will automatically reconnect
after network errors.

#### downlink.onClose = function ()

The `onClose` callback gets invoked when the downlink has been disconnected and
will not be reconnected.  This happens when the client calls `downlink.close()`,
or when the link is explicityly `@unlinked` by the remote host, or when the
network connection that carries a non-`keepAlive` link gets disconnected.

### ListDownlink

A `ListDownlink` synchronizes its state with a remote ordered `ListLane`.  A
`ListDownlink` supports the full functionality of an ordinary [Downlink](#downlink).
It also implements array-like methods.  All list operations are transparently
synchronized with the remote lane.  And all operations on the remote lane are
transparently synchronized with the `ListDownlink` object.

Note that the complete state of the list is not gauranteed to be available
until the `onSynced` callback has been invoked.  And the downlinked list state
may desync when the link's underlying network connection drops.

#### listDownlink.length

Returns the number of values in the downlinked list state.

#### listDownlink.get(index)

Returns the value at `index` in the downlinked list state.

#### listDownlink.set(index, value)

Sets `value` at `index` of the downlinked list state, and pushes the change to
the remote lane.

#### listDownlink.push(value1, ..., valueN)

Appends one or more values to the end of the downlinked list state, and pushes
the changes to the remote lane.  Returns the new length of the list.

#### listDownlink.pop()

Removes and returns the last value of the downlinked list state, pushing any
change to the remote lane.  Returns `undefined` if the list is empty.

#### listDownlink.unshift(value1, ..., valueN)

Prepends one or more values to the beginning of the downlinked list state, and
pushes the changes to the remote lane.  Returns the new length of the list.

#### listDownlink.shift()

Removes and returns the first value of the downlinked list state, pushing any
change to the remote lane.  Returns `undefined` if the list is empty.

#### listDownlink.move(fromIndex, toIndex)

Moves that value at index `fromIndex` to index `toIndex`, pushing the change
to the remote lane.

#### listDownlink.splice(startIndex, deleteCount[, value1, ..., valueN])

Removes `deleteCount` elements from the downlinked list state, starting at
index `start`, and inserts zero or more new values at `startIndex`.  Pushes
all changes to the remote lane.

#### listDownlink.clear()

Removes all values from the downlinked list state, as well as the remote list lane.
Returns `this`.

#### listDownlink.forEach(callback[, thisArg])

Invokes `callback` for every value in the downlinked list state.  If provided,
`thisArg` will be passed to each invocation of `callback` for use as its `this` value.

`callback` is invoked with three arguments:
- the current list value
- the index of the current list value
- the `listDownlink` being traversed

#### listDownlink.state

Returns the internal downlinked list state as an array.

### MapDownlink

A `MapDownlink` synchronizes its state with a remote `MapLane`.  A `MapDownlink`
supports the full functionality of an ordinary [Downlink](#downlink).  It also
implements the behavior of a JavaScript key-value `Map`.  All map operations
are transparently synchronized with the remote lane.  And all operations on
the remote lane are transparently syncrhonized with the `MapDownlink` object.
`MapDownlink` seamlessly supports complex key objects.

Note that the complete state of the map is not guaranteed to be available until
the `onSynced` callback has been invoked.  And the downlinked map state may
desync when the link's underlying network connection drops.

#### mapDownlink.size

Returns the number of entries in the downlinked map state.

#### mapDownlink.has(key)

Returns `true` if the downlinked map state contains a given `key`.

#### mapDownlink.get(key)

Returns the value associated with a given `key` in the downlinked map state.

#### mapDownlink.set(key, value)

Associates a `value` with a given `key` in the downlinked map state.  Pushes
the change to the remote lane.  Returns `this`.

#### mapDownlink.delete(key)

Removes an entry with `key` from the downlinked map state, pushing any change
to the remote map lane.  Returns `true` if an entry was removed, otherwise
returns `false`.

#### mapDownlink.clear()

Removes all entries from the downlinked map state, as well as the remote map lane.
Returns `this`.

#### mapDownlink.keys()

Returns an array of all keys in the downlinked map state.

#### mapDownlink.values()

Returns an array of all values in the downlinked map state.

#### mapDownlink.forEach(callback[, thisArg])

Invokes `callback` for every value in the downlinked map state.  If provided,
`thisArg` will be passed to each invocation of `callback` for use as its `this` value.

`callback` is invoked with two arguments:
- the map value
- the `mapDownlink` being traversed

#### mapDownlink.primaryKey

Returns the primary key function used to derive keys from messages.

#### mapDownlink.sortBy

Returns the function used to sort the downlinked map state.

#### mapDownlink.state

Returns the internal downlinked map state as an array.

### DownlinkBuilder

#### builder.host(hostUri)

Sets the host URI of the downlink to create and returns `this`.

#### builder.node(nodeUri)

Sets the node URI of the downlink to create and returns `this`.

#### builder.lane(laneUri)

Sets the lane URI of the downlink to create and returns `this`.

#### builder.prio(priority)

Sets the priority of the downlink to create and returns `this`.

#### builder.keepAlive(keepAlive)

Sets the boolean keep-alive mode of the downlink to create and returns `this`.

#### builder.delegate(delegate)

Sets the event delegate object of the downlink to create and returns `this`.

#### builder.onEvent(callback)

Sets the `onEvent` callback of the downlink to create and returns `this`.

#### builder.onCommand(callback)

Sets the `onCommand` callback of the downlink to create and returns `this`.

#### builder.onLink(callback)

Sets the `onLink` callback of the downlink to create and returns `this`.

#### builder.onLinked(callback)

Sets the `onLinked` callback of the downlink to create and returns `this`.

#### builder.onSync(callback)

Sets the `onSync` callback of the downlink to create and returns `this`.

#### builder.onSynced(callback)

Sets the `onSynced` callback of the downlink to create and returns `this`.

#### builder.onUnlink(callback)

Sets the `onUnlink` callback of the downlink to create and returns `this`.

#### builder.onUnlinked(callback)

Sets the `onUnlinked` callback of the downlink to create and returns `this`.

#### builder.onConnect(callback)

Sets the `onConnect` callback of the downlink to create and returns `this`.

#### builder.onDisconnect(callback)

Sets the `onDisconnect` callback of the downlink to create and returns `this`.

#### builder.onError(callback)

Sets the `onError` callback of the downlink to create and returns `this`.

#### builder.onClose(callback)

Sets the `onClose` callback of the downlink to create and returns `this`.

#### builder.primaryKey(function)

Sets the `primaryKey` function option of the synchronized map downlink to
create and returns `this`.

#### builder.sortBy(function)

Sets the `sortBy` function option of the synchronized map downlink to create
and returns `this`.

#### builder.link()

Returns a [Downlink](#downlink) parameterized by the builder's configuration.

#### builder.sync()

Returns a synchronized [Downlink](#downlink) parameterized by the builder's
configuration.

#### builder.syncList()

Returns a synchronized [ListDownlink](#listdownlink) parameterized by the
builder's configuration.

#### builder.syncMap()

Returns a synchronized [MapDownlink](#listdownlink) parameterized by the
builder's configuration.
