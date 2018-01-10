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
  stream: Promise<stream.Readable>,
  consumer?: any
}

export interface Stream<T> {
  internals: StreamInternals<T>,
  countConsumers(): number,
  thru<R, Fn: (Stream<T>) => R>(f: Fn): R
}

export type Reducer<T, AccumulationT> = (AccumulationT, Event<T>) => Promise<AccumulationT> | AccumulationT;
export type ReducerTransformer<T, TransformedT, AccumulationT> = (Reducer<TransformedT, AccumulationT>) => Reducer<T, AccumulationT>;
export type Seeder<AccumulationT> = () => ?AccumulationT;

function transduce<T, TransformedT, AccumulationT>(
  transformer?: ReducerTransformer<T, TransformedT, AccumulationT>,
  reducer: Reducer<TransformedT, AccumulationT>,
  seeder: Seeder<AccumulationT>): (Stream<T>) => Promise<AccumulationT> {
  const createListener = (readableStream, onFulfilled, onRejected) => {
    let accumulation = seeder();
    // $FlowFixMe it seems the T == TransformedT case is not well handled...
    const finalReducer: Reducer<T, AccumulationT> = transformer ? transformer(reducer) : reducer;
    return {
      data: (value) => {
        try {
          if (accumulation instanceof Promise) {
            // We only have a promise on the accumulation
            // -> Pause and resume after
            readableStream.pause();
            accumulation = accumulation
              .then((fulfilledAccumulation) => {
                const updatedAccumulation = finalReducer(fulfilledAccumulation, { value });
                readableStream.resume();
                return updatedAccumulation;
              })
              .catch(onRejected);
          }
          else {
            accumulation = finalReducer(accumulation, { value });
          }
        }
        catch (error) {
          onRejected(error);
        }
      },
      end: () => {
        accumulation = Promise.resolve(accumulation)
          .then((fulfilledAccumulation) => finalReducer(fulfilledAccumulation, { done: true }))
          .then(onFulfilled, onRejected);
      },
      error: (error) => {
        accumulation = Promise.resolve(accumulation)
          .then((fulfilledAccumulation) => finalReducer(fulfilledAccumulation, { error }))
          .then(onFulfilled, onRejected);
      }
    };
  };

  return (stream) => {
    if (stream.internals.consumer) {
      throw new StreamError('Stream already being consumed.');
    }
    const transducerPromise = stream.internals.stream
      .then((readableStream) => new Promise((resolve, reject) => {
        const listener = createListener(readableStream, resolve, reject);
        readableStream
          .on('data', listener.data)
          .on('end', listener.end)
          .on('error', listener.error)
          .resume();
      }));

    stream.internals.consumer = transducerPromise;
    return transducerPromise;
  };
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
    const transformedStream = wrapReadableStream(stream.internals.stream
      .then((readableStream) => {
        readableStream
          .on('error', (error)  => {
            wrappedTransformer({ error: error }, createTransformerPush(transformer))
              .catch((error) => transformer.emit('error', error));
          })
          .pipe(transformer);
        return transformer;
      }));
    stream.internals.consumer = transformedStream;
    return transformedStream;
  };
}

type Subscriber<T> = (event: Event<T>) => Promise<void> | void;

function subscribe<T>(subscriber: Subscriber<T>): (Stream<T>) => Promise<void> {
  return transduce(
    undefined,
    (_, event) => subscriber(event),
    () => undefined);
}

function wrapReadableStream<T>(stream: stream.Readable | Promise<stream.Readable>): Stream<T> {
  return {
    internals: {
      stream: stream instanceof Promise ? stream : Promise.resolve(stream)
    },
    countConsumers() {
      return this.internals.consumer ? 1 : 0;
    },
    thru<R, Fn: (Stream<T>) => R>(f: Fn): R {
      return f(this);
    }
  };
}

type ProducerP<ProducedT, SeedT> = (push: Push<ProducedT>, seed: ?SeedT) => Promise<?SeedT>;
type Producer<ProducedT, SeedT> = (push: Push<ProducedT>, seed: ?SeedT) => Promise<?SeedT> | ?SeedT;

function wrapProducer<ProducedT, SeedT>(producer: Producer<ProducedT, SeedT>, initialSeed: ?SeedT) {
  const wrappedProducer: ProducerP<ProducedT, SeedT> = wrapInPromise(producer);
  return (stream: Readable) => {
    const theInitialSeed: ?SeedT = initialSeed;
    return ({ buffer = [], productionEnded = false, seed = theInitialSeed } = {}) => {
      // Even when paused one push is needed.
      let expectPush = true;
      // 1 - Let's deal with remaining events
      while (buffer.length > 0 && expectPush) {
        const event = buffer.shift();
        if (event.error) {
          stream.emit('error', event.error);
          return { buffer: [], productionEnded, seed: (undefined: ?SeedT) };
        }
        else if (event.done) {
          stream.push(null);
          return { buffer: [], productionEnded, seed: (undefined: ?SeedT) };
        }
        else {
          // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
          expectPush = stream.push(event.value);
        }
      }
      // 2 - And now the new ones
      if (productionEnded) {
        return { buffer, productionEnded, seed };
      }
      return wrappedProducer(
        (event: Event<ProducedT>) => {
          if (productionEnded) {
            throw new StreamError('No event should be produced once the stream has ended.');
          }
          else if (event.error) {
            if (!expectPush) {
              buffer.push(event);
            }
            else {
              stream.emit('error', event.error);
            }
            productionEnded = true;
          }
          else if (event.done) {
            if (!expectPush) {
              buffer.push(event);
            }
            else {
              stream.push(null);
            }
            productionEnded = true;
          }
          else {
            if (!expectPush) {
              buffer.push(event);
            }
            else {
              // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
              expectPush = stream.push(event.value);
            }
          }
        // $FlowFixMe not sure why this doesn't work here...
        }, seed)
        .then((seed: ?SeedT) => ({ buffer, productionEnded, seed }))
        .catch((error) => {
          if (productionEnded) {
            throw error;
          }
          else if (expectPush) {
            stream.emit('error', error);
            return { buffer: [], productionEnded: true, seed: (undefined: ?SeedT) };
          }
          else {
            buffer.push({ error });
            return { buffer, productionEnded: true, seed: (undefined: ?SeedT) };
          }
        });
    };
  };
}

function produce<ProducedT, SeedT>(producer: Producer<ProducedT, SeedT>, seed: ?SeedT): Stream<ProducedT> {
  const wrappedProducer = wrapProducer(producer, seed);
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
  transduce,
  transform
};
