// @flow
const { Readable, Transform } = require('stream');
const { StreamError } = require('./errors');
const { wrapInPromise } = require('./utils');

import type stream from 'stream';

type EventDone = {| done: true |};
type EventError  = {| error: Error, done?: false |};
type EventValue<T>  = {| value: T, done?: false |};
export type Event<T> = EventDone | EventError | EventValue<T>;

opaque type StreamInternals<T> = {
  stream: stream.Readable,
  consumer?: any
}

export interface Stream<T> {
  internals: StreamInternals<T>,
  thru<R, Fn: (Stream<T>) => R>(f: Fn): R
}

export type Push<T> = (Event<T>) => void;
type PureTransformer<ConsumedT, ProducedT> = (event: Event<ConsumedT>, push: Push<ProducedT>) => Promise<void>;
export type Transformer<ConsumedT, ProducedT, SeedT = void> = (event: Event<ConsumedT>, push: Push<ProducedT>, seed: ?SeedT) => ?SeedT | Promise<?SeedT>;

function createTransformerFactory<ConsumedT, ProducedT, SeedT>(transformer: Transformer<ConsumedT, ProducedT, SeedT>, initialSeed: ?SeedT): () => PureTransformer<ConsumedT, ProducedT>{
  const wrappedTransformer = wrapInPromise(transformer);
  return () => {
    let currentSeed = initialSeed;
    return (event, push) => wrappedTransformer(event, push, currentSeed)
      .then((newSeed) => {
        currentSeed = newSeed;
      });
  };
}

function createTransformerPush<T>(stream: stream.Transform, { disableDone } = {}): Push<T> {
  const onError = (event: EventError) => {
    stream.emit('error', event.error);
  };
  const onDone = disableDone ?
    (event: EventDone) => undefined :
    (event: EventDone) => {
      stream.emit('end');
      stream.emit('finish');
    };
  const onValue = (event: EventValue<T>) => {
    // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
    stream.push(event.value);
  };
  return (event: Event<T>) => {
    if (event.error) {
      onError(event);
    }
    else if (event.done) {
      onDone(event);
    }
    else {
      onValue(event);
    }
  };
}

function transform<ConsumedT, ProducedT, SeedT>(transformer: Transformer<ConsumedT, ProducedT, SeedT>, seed: ?SeedT): (Stream<ConsumedT>) => Stream<ProducedT> {
  const transformerFactory = createTransformerFactory(transformer, seed);

  return (stream: Stream<ConsumedT>) => {
    if (stream.internals.consumer) {
      throw new StreamError('Stream already being consumed.');
    }
    const wrappedTransformer = transformerFactory();
    const transformer = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        wrappedTransformer({ value: chunk }, createTransformerPush(this))
          .catch((error) => this.emit('error', error))
          .then(callback);
      },
      flush(callback) {
        wrappedTransformer({ done: true }, createTransformerPush(this, { disableDone: true }))
          .catch((error) => this.emit('error', error))
          .then(callback);
      }
    });
    const transformedStream = wrapReadableStream(transformer);
    stream.internals.consumer = transformedStream;
    stream.internals.stream
      .on('error', (error)  => {
        wrappedTransformer({ error: error }, createTransformerPush(transformer))
          .catch((error) => transformer.emit('error', error));
      })
      .pipe(transformer);
    return transformedStream;
  };
}

function drain<T>(): (Stream<T>) => Promise<void> {
  return (stream) => {
    if (stream.internals.consumer) {
      throw new StreamError('Stream already being consumed.');
    }
    const drainPromise = new Promise((resolve, reject) => {
      stream.internals.stream
        .on('end', () => {
          stream.internals.stream.removeAllListeners();
          resolve();
        })
        .on('error', (error) => {
          stream.internals.stream.removeAllListeners();
          reject(error);
        })
        .resume();
    });
    stream.internals.consumer = drainPromise;
    return drainPromise;
  };
}

function wrapReadableStream<T>(stream): Stream<T> {
  return {
    internals: { stream },
    thru<R, Fn: (Stream<T>) => R>(f: Fn): R {
      return f(this);
    }
  };
}

type ProducerP<T> = (push: Push<T>) => Promise<void>;
type Producer<T> = (push: Push<T>) => void | Promise<void>;

function produce<T>(producer: Producer<T>): Stream<T> {
  const wrappedProducer: ProducerP<T> = wrapInPromise(producer);

  let eventsPromise = Promise.resolve({ buffer: [], state: 'FLOWING' });
  const pushThunk = (stream: Readable) => (event: Event<T>) => {
    if (event.error) {
      stream.emit('error', event.error);
      return 'ERROR';
    }
    else if (event.done) {
      stream.push(null);
      return 'DONE';
    }
    else {
      // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
      return stream.push(event.value) ? 'FLOWING' : 'PAUSED';
    }
  };
  const stream = new Readable({
    objectMode: true,
    read(size) {
      const push = pushThunk(this);
      eventsPromise = eventsPromise.then(({ buffer, state }) => {
        // 1 - Let's deal with remaining events
        while (buffer.length > 0) {
          const event = buffer.shift();
          state = push(event);
          if (state != 'FLOWING') {
            break;
          }
        }
        if (state != 'FLOWING') {
          return Promise.resolve({ buffer, state });
        }
        // 2 - And now the new ones
        return wrappedProducer(
          (event: Event<T>) => {
            if (state == 'FLOWING') {
              state = push(event);
            }
            else if (state == 'PAUSED') {
              buffer.push(event);
            }
            else {
              throw new StreamError('No event should be produced once the stream has ended.');
            }
          })
          .catch((error) => {
            if (state == 'FLOWING') {
              state = push({ error });
            }
            else if (state == 'PAUSED') {
              buffer.push({ error });
            }
            else {
              throw error;
            }
          })
          .then(() => ({ buffer, state }));
      });
    }
  });
  return wrapReadableStream(stream);
}

function isIterable(obj) {
  if (!obj) {
    return false;
  }
  // $FlowFixMe bug in the Iterable type of flow (cf. https://github.com/facebook/flow/issues/1163)
  return typeof obj[Symbol.iterator] === 'function';
}

function from<T>(input: Iterable<T> | stream.Readable): Stream<T> {
  if (input instanceof Readable) {
    const transformer = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        this.push(chunk, encoding);
        callback();
      }
    });
    const transformedStream = wrapReadableStream(transformer);
    // Forward errors to the transformed stream
    input.on('error', (error) => transformer.emit('error', error));
    input.pipe(transformer);
    return transformedStream;
  }
  else if (isIterable(input)) {
    // $FlowFixMe bug in the Iterable type of flow (cf. https://github.com/facebook/flow/issues/1163)
    const iterator: Iterator<T> = input[Symbol.iterator]();
    return wrapReadableStream(new Readable({
      objectMode: true,
      read() {
        for (;;) {
          const { done, value } = iterator.next();
          if (done) {
            this.push(null);
            return;
          }
          if (!this.push(value)) {
            return;
          }
        }
      }
    }));
  }
  else {
    return throwError(new StreamError('Unable to create a stream, \'from\' only supports iterable or Readable stream.'));
  }
}

function of<T>(...args: T[]): Stream<T> {
  return from(args);
}

function throwError<T>(error: Error): Stream<T> {
  return wrapReadableStream(new Readable({
    objectMode: true,
    read() {
      this.emit('error', error);
    }
  }));
}

module.exports = {
  drain,
  from,
  of,
  produce,
  throwError,
  transform
};
