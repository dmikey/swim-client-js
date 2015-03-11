# Structural Web Integrated Messaging (SWIM) Client

[![Build Status](https://travis-ci.org/coeffect/swim-client-js.svg?branch=master)](https://travis-ci.org/coeffect/swim-client-js) [![Coverage Status](https://coveralls.io/repos/coeffect/swim-client-js/badge.svg?branch=master)](https://coveralls.io/r/coeffect/swim-client-js?branch=master)

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

#### swim.link(node_uri, lane_uri, handler)

Subscribe to messages flowing through `node_uri` within `lane_uri`, invoking
`handler.done(message)` for each event.  If `handler` is a function, it gets
wrapped as the `done` method of a new handler object.

The SWIM client takes care of holding open multiplexed channels to all
endpoints with active links.

```js
swim.link('http://iot.example.com/house', 'light', function (event) {
  console.log('event from ' + event.node + ': ' + event.body);
});
```

#### swim.unlink(node_uri, lane_uri, handler)

Unsubscribe a previously linked `handler` from messages flowing through
`node_uri` within `lane_uri`.  The SWIM client takes care of closing
multiplexed channels to endpoints without active links.

```js
var handler = {done: function (event) {}};
swim.link('http://iot.example.com/house#kitchen', 'light', handler);
swim.unlink('http://iot.example.com/house#kitchen', 'light', handler);
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

#### swim.sendCommand(node_uri, lane_uri, message)

Dispatch `message` to `node_uri` on `lane_uri` as a command.  The endpoint
responsible for `node_uri` will propagate the message down the data model.
The SWIM client takes care of maintaining multiplexed channels to all active
endpoints.

```js
swim.sendCommand('http://iot.example.com/house', 'light/off');
```

#### swim.get(node_uri, handler)

Fetch the data model at `node_uri`.

```js
swim.get('http://iot.example.com/house', function (response) {
  console.log('model: '+ response.body);
});
```

#### swim.put(node_uri, content, handler);

Update the data model at `node_uri` with RECON `content`.

```js
swim.put('http://iot.example.com/house', recon.parse('living: @room'), function (response) {
  console.log('updated model: '+ response.body);
});
```
