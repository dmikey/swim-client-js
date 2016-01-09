# SWIM Client Javascript Implementation

## JavaScript Library

The SWIM client library can run in any standard JavaScript environment.
Use `npm` to incorporate the library into Node.js projects.

```
npm install --save swim-client-js
```

```js
var swim = require('swim-client-js');
```

### Client API

#### swim.link(node_uri, lane_uri, handle)

Subscribe to messages flowing through `node_uri` within `lane_uri`, invoking
`handle.onEvent(message)` for each event, and `handle.onCommand(message)` for
each command.  If `handle` is a function, it gets wrapped as the `onEvent` and
`onCommand` methods of a new handle object.

The SWIM client manages multiplexed channels to all endpoints with active links.
If the underlying channel disconnects, the SWIM client calls `handle.onBroken()`,
and attempts to reopen the channel with exponential backoff.  If the connection
is re-established, the SWIM client invokes `handle.onUnbroken()`.  Broken
channels are retried indefinitely, or until all link handles to the failed
endpoint are unlinked.

```js
swim.link('http://iot.example.com/house', 'light', function (event) {
  console.log('event from ' + event.node + ': ' + event.body);
});
```

#### swim.unlink(node_uri, lane_uri, handle)

Unsubscribe a previously linked `handle` from messages flowing through
`node_uri` within `lane_uri`.  The SWIM client takes care of closing
multiplexed channels to endpoints without active links.

```js
function handle(message) {}
swim.link('http://iot.example.com/house#kitchen', 'light', handle);
swim.unlink('http://iot.example.com/house#kitchen', 'light', handle);
```

#### swim.sendCommand(node_uri, lane_uri, message)

Dispatch `message` to `node_uri` on `lane_uri` as a command.  The endpoint
responsible for `node_uri` will propagate the message down the data model.
The SWIM client takes care of maintaining multiplexed channels to all active
endpoints.

```js
swim.sendCommand('http://iot.example.com/house', 'light/off');
```


#### swim.sendEvent(node_uri, lane_uri, message)

Dispatch `message` to `node_uri` on `lane_uri` as an event.  The endpoint
responsible for `node_uri` will propagate the event up the data model.
As usual, the SWIM client takes care of maintaining multiplexed channels
to all active endpoints.

```js
swim.sendEvent('http://iot.example.com/house#kitchen/toaster', 'toaster/done',
  recon.parse('@toasted' { items: 2 }));
```