// @flow
const { Readable } = require('stream');
const { StreamError } = require('./errors');
const { wrapInPromise } = require('./utils');

import type stream from 'stream';

type EventDone = {| done: true |};
type EventError  = {| error: Error, done?: false |};
type EventValue<T>  = {| value: T, done?: false |};
export type Event<T> = EventDone | EventError | EventValue<T>;

opaque type InternalStream<T> = stream.Readable;

type SimpleProducer<ProducedT, SeedT> = (push: Push<ProducedT>, seed: ?SeedT) => ?SeedT;

function createInternalStream<ProducedT, SeedT>(producer: SimpleProducer<ProducedT, SeedT> = (push) => {}, seed: ?SeedT): InternalStream<ProducedT> {
  let currentSeed = seed;
  return new Readable({
    objectMode: true,
    read() {
      currentSeed = producer((event) => {
        if (event.done) {
          this.push(null);
        }
        else if (event.error) {
          this.emit('error', event.error);
        }
        else {
          // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
          this.push(event.value);
        }
      }, currentSeed);
    }
  });
}

function appendInternalStream<T>(stream: InternalStream<T>, event: Event<T>): InternalStream<T> {
  if (event.done) {
    stream.push(null);
  }
  else if (event.error) {
    stream.emit('error', event.error);
  }
  else {
    // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
    stream.push(event.value);
  }
  return stream;
}

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
        // console.log('transduce listener end');
        accumulation = Promise.resolve(accumulation)
          .then((fulfilledAccumulation) => finalReducer(fulfilledAccumulation, { done: true }))
          .then(onFulfilled, onRejected);
      },
      error: (error) => {
        // console.log('transduce listener error', error.toString());
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
          .on('error', listener.error)
          .on('end', listener.end)
          .resume();
      }));

    stream.internals.consumer = transducerPromise;
    return transducerPromise;
  };
}

function transduceToStream<ConsumedT, ProducedT>(transformer: ReducerTransformer<ConsumedT, ProducedT, any>): (Stream<ConsumedT>) => Stream<ProducedT> {
  const transducer = transduce(transformer, appendInternalStream, createInternalStream);
  return (stream) => wrapReadableStream(transducer(stream));
}

export type Push<T> = (Event<T>) => void;
export type Transformer<ConsumedT, ProducedT, SeedT = void> = (event: Event<ConsumedT>, push: Push<ProducedT>, seed: ?SeedT) => ?SeedT | Promise<?SeedT>;

function transform<ConsumedT, ProducedT, SeedT>(transformer: Transformer<ConsumedT, ProducedT, SeedT>, seed: ?SeedT): (Stream<ConsumedT>) => Stream<ProducedT> {
  const reducerTransformer = (reducer) => {
    const wrappedTransformer = wrapInPromise(transformer);
    let currentSeed = seed;
    return (accumulation, consumedEvent) => {
      let accumulationPromise = Promise.resolve(accumulation);
      return wrappedTransformer(
        consumedEvent,
        (producedEvent) => {
          accumulationPromise = accumulationPromise
            .then((accumulation) => reducer(accumulation, producedEvent));
        },
        currentSeed)
        .then((newSeed) => {
          currentSeed = newSeed;
          return accumulationPromise;
        });
    };
  };

  return transduceToStream(reducerTransformer);
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

export type Producer<ProducedT, SeedT> = (push: Push<ProducedT>, seed: ?SeedT) => ?SeedT | Promise<?SeedT>;

function produce<ProducedT, SeedT>(producer: Producer<ProducedT, SeedT>, seed: ?SeedT): Stream<ProducedT> {
  return wrapReadableStream(createInternalStream(
    (push, currentSeed) => {
      if (currentSeed instanceof Promise) {
        return currentSeed.then((seed) => producer(push, seed));
      }
      else {
        currentSeed = producer(push, currentSeed);
        return currentSeed;
      }
    },
    seed
  ));
}

function infinite<T>(): Stream<T> {
  return produce((push) => {});
}

function append<T>(stream: Stream<T>, event: Event<T>): Stream<T> {
  stream.internals.stream
    .then((readableStream) => {
      if (event.done) {
        readableStream.push(null);
      }
      else if (event.error) {
        readableStream.emit('error', event.error);
      }
      else {
        // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
        readableStream.push(event.value);
      }
    });
  return stream;
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
    let stream = infinite();
    const dataListener = (value) => append(stream, { value });
    const errorListener = (error) => {
      append(stream, { error });
      input
        .removeListener('data', dataListener)
        .removeListener('error', errorListener)
        .removeListener('end', endListener);
    };
    const endListener = () => {
      append(stream, { done: true });
      input
        .removeListener('data', dataListener)
        .removeListener('error', errorListener)
        .removeListener('end', endListener);
    };
    input
      .on('data', dataListener)
      .on('error', errorListener)
      .on('end', endListener)
      .resume();
    return stream;
  }
  else if (isIterable(input)) {
    // $FlowFixMe bug in the Iterable type of flow (cf. https://github.com/facebook/flow/issues/1163)
    const iterator: Iterator<T> = input[Symbol.iterator]();
    return wrapReadableStream(createInternalStream(
      (push) => {
        const { done, value } = iterator.next();
        if (done) {
          push({ done: true });
        }
        else {
          push({ value });
        }
      }
    ));
  }
  else {
    return throwError(new StreamError('Unable to create a stream, \'from\' only supports iterable or Readable stream.'));
  }
}

function of<T>(...args: T[]): Stream<T> {
  return from(args);
}

function throwError<T>(error: Error): Stream<T> {
  return produce((push) => {
    push({ error });
  });
}

module.exports = {
  from,
  of,
  produce,
  subscribe,
  throwError,
  transduce,
  transduceToStream,
  transform
};
