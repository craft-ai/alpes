# Alpes - Back-pressure streams with a modern API

[![Version](https://img.shields.io/npm/v/alpes.svg?style=flat-square)](https://npmjs.org/package/alpes) [![Build](https://img.shields.io/travis/craft-ai/alpes/master.svg?style=flat-square)](https://travis-ci.org/craft-ai/alpes) [![License](https://img.shields.io/badge/license-BSD--3--Clause-42358A.svg?style=flat-square)](LICENSE)

:construction:

## API

### Notation

This documentations uses stream notations following a simple timeline notation.

```
stream1: -a-b-c-d->

stream2: -a--b---c|

stream3: -abc-def-X
```

Time proceeds from left to right, using letters and symbols to indicate certain things:

- `-` - an instant in time where no event occurs
- letters (a,b,c,d,etc) - an event at an instant in time
- `|` - end of stream
- `X` - an error occurred at an instant in time
- `>` - stream continues infinitely \* Typically, `>` means you can assume that a stream will continue to repeat some common pattern infinitely

### Examples

`stream: a|`

A stream that emits `a` and then ends immediately.

`stream: a-b---|`

A stream that emits `a`, then `b`, and some time later ends.

`stream: a-b-X`

A stream that emits `a`, then `b`, then fails.

`stream: abc-def->`

A stream that emits `a`, then `b`, then `c`, then nothing, then `d`, then `e`, then `f`, and then continues infinitely.

### Creators

#### `of(...<args>) -> <Stream>`

```js
const { of } = require('alpes');

const stream = of('a', 'b', 'c');
// stream: abc|
```

#### `from(<Iterable>) -> <Stream>`

See also, the [Iterable documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_generators#Iterables).

```js
const { from } = require('alpes');

const stream = from(['a', 'b', 'c']);
// stream: abc|
```

#### `from(<stream.Readable>) -> <Stream>`

See also, the [stream.Readable documentation](https://nodejs.org/api/stream.html#stream_readable_streams).

```js
const fs = require('fs');
const { from } = require('alpes');

const stream = from(fs.createReadStream('./some.file'));
// stream: -chunk1-chunk2-chunk3|
```

#### `from(<Error>) -> <Stream>` or `throwError(<Error>) -> <Stream>`

See also, the [Error documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error).

```js
const { from } = require('alpes');

const stream = from(new Error('X'));
// stream: X
```

or

```js
const { throwError } = require('alpes');

const stream = throwError(new Error('X'));
// stream: X
```

#### `from(<Promise>) -> <Stream>`

See also, the [Promise documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).

```js
const { from } = require('alpes');

const stream1 = from(
  new Promise((resolve) => setTimeout(() => resolve('a'), 500))
);
// stream1: ---a|

const stream2 = from(Promise.reject(new Error('X')));
// stream2: -X
```

#### `produce(<producer>, <seed>) -> <Stream>`

```js
const { produce } = require('alpes');

// Simple 'synchronous' stream production.
const stream1 = produce((push) => {
  push({ value: 'a' });
  push({ value: 'b' });
  push({ value: 'c' });
  push({ done: true });
});
// stream1: abc|

// The producer is called only when the downstream consumers are ready,
// the seed let's the production picks up when it ended.
const stream2 = produce((push, value) => {
  push({ value: value });
  const nextValue = value--;
  if (nextValue < 0) {
    push({ done: true });
  }
  return nextValue;
}, 5);
// stream2: 5-4-3-2-1-0|

// Async producers can return a promise to the updated seed.
const stream3 = produce((push, value) => {
  return new Promise((resolve) => setTimeout(resolve, 500)) // Wait 500ms
    .then(() => {
      push({ value: value });
      const nextValue = value--;
      if (nextValue < 0) {
        push({ error: new Error('X') });
      }
      return nextValue;
    });
}, 5);
// stream3: ---5---4---3---2---1---0X

// Thrown errors or returned rejected promise are not swallowed.
const stream4 = produce(() => {
  return Promise.reject(new Error('X'));
});
// stream4: -X

// `push` returns `false` when the downstream consumers can't follow and it's a
// good time to stop pushing. Subsequent values will be cached.
//
// TLDR: For better memory management, design your producer to return when push returns `false`.
const stream5 = produce((push) => {
  while (push({ value: 'v' })) {
    // NOTHING
  }
});
// stream5: vvvvvvv----vvvvvvvv--[...]-vv>
```

### Transformers

### `stream.drain() -> <Promise>` or `drain()(stream) -> <Promise>`

```js
stream
  .drain()
  .then(() => {
    // Called when the stream ends.
  })
  .catch((error) => {
    // Called when an error event is encountered.
  });
```

### `stream.collect() -> <Promise>` or `collect()(stream) -> <Promise>`

```js
stream // ---a--bc|
  .collect()
  .then((events) => {
    // Called when the stream ends, events is ['a', 'b', 'c'].
  })
  .catch((error) => {
    // Called when the latest event is an error.
  });
```

### `stream.subscribe(<consumer>) -> <Promise>` or `subscribe(<consumer>)(stream) -> <Promise>`

```js
stream // ---a--b--cX
  .subscribe((event) => {
    // 1st call: { value: 'a' }
    // 2nd call: { value: 'b' }
    // 3rd call: { value: 'c' }
    // 4th call: { error: new Error('X') }
  })
  .then((events) => {
    // Called after the last call to the consumer.
  })
  .catch((error) => {
    // Called when an error event is triggered in the consumer.
  });
```

The consumer can slow down the upstream, returning a `Promise` let `suscribe` knows about the duration of the consumption and adapt the speed of the stream accordingly. **alpes** guarantees the `consumer` is never called more that once simultaneously, producers are slowed down and events are cached as needed.

```js
stream // ---a--b--c|
  .subscribe((event) => {
    if (event.value) {
      // Consumption takes 500ms
      return new Promise((resolve) => setTimeout(resolve, 500)).then(() =>
        console.log(event.value)
      );
    }
    // Other events don't need consumption.
  })
  .then((events) => {
    // Called after the last call to the consumer, i.e. more than 3 * 500ms
    // after the start of the stream.
  });
```

### `stream.map(<mapper>) -> <Stream>` or `map(<mapper>)(stream) -> <Stream>`

```js
const mappedStream1 = stream1 // -1----2-3|
  .map((v) => v * 2);
// mappedStream1: -2----4-6|

const mappedStream2 = stream2 // 1--2----3|
  .map((v) => {
    if (v === 2) {
      throw new Error('X');
    }
    return v * 3;
  });
// mappedStream2: 3--X

const mapper = map((v) => v / 3);

const mappedStream3 = mapper(
  stream3 // 3--9--6--|
);
// mappedStream3: 1--3--2--|

const mappedStream4 = mapper(
  stream4 // 3--9--6--X
);
// mappedStream4: 1--3--2--X
```

### `stream.chain(<mapper>) -> <Stream>` or `stream.mergeMap(<mapper>) -> <Stream>` or `chain(<mapper>)(stream) -> <Stream>` or `mergeMap(<mapper>)(stream) -> <Stream>`

```
stream:                 -a----b----c|
mapper(a):               a--a--a|
mapper(b):                    b----b----b|
mapper(c):                           c-c-c|
stream.chain(mapper):   -a--a-ba---b-c-cbc|
```

```js
const stream = produce((push, value) => {
  return new Promise((resolve) => setTimeout(resolve, 100)) // 100ms between each push
    .then(() => {
      push({ value });
      return value + 1;
    });
}, 1);
// stream: -------1-------2-------3------->
const mappedStream = stream.chain((value) =>
  produce((push) => {
    return new Promise((resolve) => setTimeout(resolve, 200)) // 75ms between each push
      .then(() => {
        push({ value });
      });
  })
);
// mappedStream: -------1-----1-2---1-2-3-1-2-3->
```

### `stream.concatMap(<mapper>) -> <Stream>` or `concatMap(<mapper>)(stream) -> <Stream>`

```
stream:                   -a----b----c|
mapper(a):                 a--a--a|
mapper(b):                      b----b----b|
mapper(c):                             c-c-c|
stream.concatMap(mapper): -a--a--ab----b----bc-c-c|
mapper called lazily:      ^      ^          ^
```

```js
const stream = of(1, 2, 3);
// stream: 123|
const mappedStream = stream.concatMap(
  (value) =>
    from(new Promise((resolve) => setTimeout(() => resolve(value), 200))) // 200ms delay
);
// mappedStream: --1-2-3|
```

### `stream.filter(<predicate>) -> <Stream>` or `filter(<predicate>)(stream) -> <Stream>`

```js
const filteredStream = stream // -1--2----3|
  .filter((v) => v % 2 === 1);
// filteredStream: -1-------3|
```

### `stream.reduce(<reducer>) -> <Promise>` or `reduce(<reducer>)(stream) -> <Promise>`

```js
stream // -2--4---6|
  .reduce((product, v) => product * v, 1)
  .then((finalProduct) => {
    // Called after the last call to the reducer, with its result.
    // finalProduct: 48 (1*2*4*6)
  })
  .catch((error) => {
    // Called when an error event is triggered in the stream
    // or when an error is thrown in the reducer.
  });
```

The reducer can be asynchronous and returns a Promise, in this case the upstream is slowed down.

```js
stream // -2--4---6|
  .reduce(
    (product, v) =>
      new Promise((resolve) => setTimeout(resolve, 500)) // Wait 500ms
        .then(() => product * v),
    1
  )
  .then((finalProduct) => {
    // Called after the last call to the reducer, with its result.
    // finalProduct: 48 (1*2*4*6)
  })
  .catch((error) => {
    // Called when an error event is triggered in the stream
    // or when an error is thrown in the reducer.
  });
```

### `stream.scan(<reducer>) -> <Stream>` or `scan(<reducer>)(stream) -> <Stream>`

```js
const scannedStream = stream // -2-----3-1|
  .scan((product, v) => product * v, 1);
// scannedStream: -2-----6-6|
```

The reducer can be asynchronous and returns a Promise, in this case the upstream is slowed down.

```js
const scannedStream = stream // -2-----3-1|
  .scan(
    (product, v) =>
      new Promise((resolve) => setTimeout(resolve, 500)) // Wait 500ms
        .then(() => product * v),
    1
  );
// scannedStream: --2-----6-6|
```

### `stream.tap(<function>) -> <Stream>` or `tap(<function>)(stream) -> <Stream>`

```js
const mappedStream // -6--4---2|
  .tap((v) => {
    console.log('foo', v);
    return 12; // This value will be ignored
  })
  .map((v) => v / 2)
// mappedStream1: -3--2---1|
//
// The following will be logged
// foo 6
// foo 4
// foo 2
```

### `stream.batch(<count>) -> <Stream>` or `batch(<count>)(stream) -> <Stream>`

```js
const batchedStream = stream // -1-2-3-4-5|
  .batch(2);
// batchedStream: ---[1,2]---[3,4]-[5]|
```

### `stream.rateLimit(<interval>) -> <Stream>` or `rateLimit(<interval>)(stream) -> <Stream>`

```js
const rateLimitedStream = stream // -1234----5--6|
  .rateLimit(500);
// rateLimitedStream: -1-2-3-4-5--6|
```

### `stream.skip(<count>) -> <Stream>` or `skip(<count>)(stream) -> <Stream>`

```js
const skippedStream = stream // -1234----5--6|
  .skip(3);
// skippedStream: ----4----5--6|
```

### `stream.take(<count>) -> <Stream>` or `take(<count>)(stream) -> <Stream>`

```js
const takkenSteam = stream // -1234----5--6->
  .take(4);
// takkenSteam: -1234|
```

### `stream.fork(<count>) -> [...<Streams>]` or `fork(<count>)(stream) -> [...<Streams>]`

```js
const [fork1, fork2] = stream // -1234----5--6->
  .fork(2);
// fork1: -1234----5--6->
// fork2: -1234----5--6->
```

### `stream.transform(<consumerProducer>, <seed>) -> <Stream>` or `transform(<consumerProducer>, <seed>)(stream) -> <Stream>`

```js
const transformedStream = stream // -1-2-3-4|
  .transform((event, push, seed) => {
    if (event.value) {
      push({ value: event.value });
      return new Promise((resolve) => setTimeout(resolve, 500)) // Wait 500ms
        .then(() => {
          push({ value: event.value + seed });
          return seed - 1;
        });
    } else {
      push(event);
    }
  }, -1);
// transformedStream: -1-0-2-0-3-0-4-0|
```

### `stream.transduce(<transformer>, <reducer>, <seeder>) -> <Stream>` or `transduce(<transformer>, <reducer>, <seeder>)(stream) -> <Stream>`

_Most of the other functions are implemented using `transduce`, in most case you shouldn't need it_

```js
const transducedStream = stream // -1-2-3-4|
  .transduce(
    // Transformer, can transform the event's value before calling the reducer (or not)
    (reducer) => (accumulation, event) => {
      if (event.done || event.error) {
        return reducer(accumulation, event);
      } else {
        return reducer(accumulation, {
          value: event.value * 2
        });
      }
    },
    // Reducer
    (accumulation, event) => {
      if (event.done) {
        return { accumulation, done: true };
      } else if (event.error) {
        throw event.error;
      } else {
        return {
          accumulation: accumulation + event.value,
          done: false
        };
      }
    },
    // Seeder, able to generate the seed value
    () => -3
  )
  .then((finalAccumulation) => {
    // Called after the last call to the reducer, with its result.
    // finalAccumulation: 17 (-3 + 1*2 + 2*2 + 3*2 + 4*2)
  })
  .catch((error) => {
    // Called when an error event is triggered in the stream
    // or when an error is thrown in transformer, reducer or seeder.
  });
```

### Combiners

### `concat(...<Streams>) -> <Stream>`

```js
const { concat } = require('alpes');

const concatenatedStream = concat(
  stream1, // -123----4---|
  stream2 //  5---6-7|
); // -123----4---5---6-7|
```

### `merge(...<Streams>) -> <Stream>`

```js
const { merge } = require('alpes');

const mergedStream = merge(
  stream1, // -123----4---|
  stream2 //  5---6-7|
); // 51236-74---|
```

## [Changelog](CHANGELOG.md)
