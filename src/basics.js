// @flow
const { Readable, Transform, Writable } = require('stream');
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
  countConsumers(): number,
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

type Subscriber<T> = (event: Event<T>) => void | Promise<void>;

function subscribe<T>(subscriber: Subscriber<T>): (Stream<T>) => Promise<void> {
  return (stream) => {
    if (stream.internals.consumer) {
      throw new StreamError('Stream already being consumed.');
    }
    const wrappedSubscriber = wrapInPromise(subscriber);
    const subscribePromise = new Promise((resolve, reject) => {
      const subscriberWritable = new Writable({
        objectMode: true,
        write(chunk, encoding, callback) {
          //console.log('*** stream write', chunk);
          wrappedSubscriber({ value: chunk })
            .then(() => {
              //console.log('*** subscriber done');
              callback();
            })
            .catch((error) => {
              //console.log('*** subscriber error', error);
              callback(error);
            });
        }
      })
        .on('finish', () => {
          //console.log('*** stream finish');
          wrappedSubscriber({ done: true })
            .then(() => {
              //console.log('*** subscriber done');
              resolve();
            })
            .catch((error) => {
              //console.log('*** subscriber error', error);
              reject(error);
            });
        })
        .on('error', (error) => {
          //console.log('*** stream error', error);
          reject(error);
        });

      stream.internals.stream
        .on('error', (error)  => {
          //console.log('*** internal stream error', error);
          wrappedSubscriber({ error: error })
            .catch((error) => {
              //console.log('*** subscriber error', error);
              subscriberWritable.emit('error', error);
            });
        })
        .pipe(subscriberWritable);
    });

    stream.internals.consumer = subscribePromise;
    return subscribePromise;
  };
}

function wrapReadableStream<T>(stream): Stream<T> {
  return {
    internals: { stream },
    countConsumers() {
      return this.internals.consumer ? 1 : 0;
    },
    thru<R, Fn: (Stream<T>) => R>(f: Fn): R {
      return f(this);
    }
  };
}

type ProducerP<T> = (push: Push<T>) => Promise<void>;
type Producer<T> = (push: Push<T>) => void | Promise<void>;

const STREAM_STATE = {
  ERROR: 'ERROR',
  DONE: 'DONE',
  FLOWING: 'FLOWING',
  PAUSED: 'PAUSED'
};

function wrapProducer<T>(producer: Producer<T>) {
  const wrappedProducer: ProducerP<T> = wrapInPromise(producer);
  return (stream: Readable) => {
    // Push wrapper handling _alpes_ events.
    const push = (event) => {
      if (event.error) {
        stream.emit('error', event.error);
        return STREAM_STATE.ERROR;
      }
      else if (event.done) {
        stream.push(null);
        return STREAM_STATE.DONE;
      }
      else {
        // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
        return stream.push(event.value) ? STREAM_STATE.FLOWING : STREAM_STATE.PAUSED;
      }
    };
    return ({ buffer = [], state = STREAM_STATE.FLOWING } = {}) => {
      // Even when paused one push is needed.
      let expectPush = true;
      // 1 - Let's deal with remaining events
      while (buffer.length > 0 && expectPush) {
        const event = buffer.shift();
        state = push(event);
        expectPush = state == STREAM_STATE.FLOWING;
      }
      // Stop when if we've reached the end
      if (state == STREAM_STATE.DONE || state == STREAM_STATE.ERROR) {
        return { buffer, state };
      }
      // 2 - And now the new ones
      return wrappedProducer(
        (event: Event<T>) => {
          if (expectPush) {
            state = push(event);
            expectPush = state == STREAM_STATE.FLOWING;
          }
          else if (state == STREAM_STATE.PAUSED) {
            buffer.push(event);
          }
          else {
            throw new StreamError('No event should be produced once the stream has ended.');
          }
        })
        .catch((error) => {
          if (expectPush) {
            state = push({ error });
            expectPush = state == STREAM_STATE.FLOWING;
          }
          else if (state == STREAM_STATE.PAUSED) {
            buffer.push({ error });
          }
          else {
            throw error;
          }
        })
        .then(() => ({ buffer, state }));
    };
  };
}

function produce<T>(producer: Producer<T>): Stream<T> {
  const wrappedProducer = wrapProducer(producer);
  // A promise to make sure we don't push stuff out of order.
  let producerPromise = Promise.resolve();

  const stream = new Readable({
    objectMode: true,
    read(size) {
      producerPromise = producerPromise.then(wrappedProducer(this));
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
  from,
  of,
  produce,
  subscribe,
  throwError,
  transform
};
