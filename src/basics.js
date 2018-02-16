// @flow
const { Readable } = require('stream');
const { StreamError } = require('./errors');
const { wrapInPromise } = require('./utils');

import type stream from 'stream';

type EventDone = {| done: true |};
type EventError  = {| error: Error, done?: false |};
type EventValue<T>  = {| value: T, done?: false |};
export type Event<T> = EventDone | EventError | EventValue<T>;

const STREAM_STATUS = {
  OPEN: 'OPEN',
  DONE: 'DONE',
  ERROR: 'ERROR'
};

type StreamStatus = $Keys<typeof STREAM_STATUS>;

type SimpleProducer<ProducedT, SeedT> = (push: Push<ProducedT>, seed: ?SeedT) => ?SeedT;

class InternalStream<T> extends Readable {
  status: StreamStatus;
  constructor(producer: SimpleProducer<T, void> = (push) => {}) {
    super({
      objectMode: true,
      read() {
        producer(this.pushEvent.bind(this));
      }
    });
    this.status = STREAM_STATUS.OPEN;
  }
  pushEvent(event: Event<T>) {
    if (this.status != STREAM_STATUS.OPEN) {
      throw new StreamError('No event should be produced once the stream has ended.');
    }
    else if (event.done) {
      // console.log('InternalStream.pushEvent done');
      this.status = STREAM_STATUS.DONE;
      this.push(null);
    }
    else if (event.error) {
      // console.log('InternalStream.pushEvent', event.error.toString());
      this.status = STREAM_STATUS.ERROR;
      // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
      this.push(event);
      this.push(null);
    }
    else {
      // console.log('InternalStream.pushEvent', event.value);
      // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
      this.push(event);
    }
  }
}

function reduceInternalStream<T>(stream: InternalStream<T>, event: Event<T>): InternalStream<T> {
  // Only push when the stream is open !
  if (stream.status == STREAM_STATUS.OPEN) {
    stream.pushEvent(event);
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

  const consumeStream = (stream) => new Promise((resolve, reject) => {
    let accumulation = seeder();
    // $FlowFixMe it seems the T == TransformedT case is not well handled...
    const finalReducer: Reducer<T, AccumulationT> = transformer ? transformer(reducer) : reducer;

    const removeListeners = () => {
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
    };
    const onData = (event) => {
      if (!event) {
        console.log('transduce listener empty event');
      }
      else if (event.error) {
        // console.log('transduce listener error', event.error.toString());

        removeListeners();

        accumulation = Promise.resolve(accumulation)
          .then((fulfilledAccumulation) => {
            return finalReducer(fulfilledAccumulation, event);
          })
          .then(resolve, reject);
      }
      else {
        // console.log('transduce listener value', event.value);
        try {
          if (accumulation instanceof Promise) {
            // We only have a promise on the accumulation
            // -> Pause and resume after
            stream.pause();
            accumulation = accumulation
              .then((fulfilledAccumulation) => {
                const updatedAccumulation = finalReducer(fulfilledAccumulation, event);
                stream.resume();
                return updatedAccumulation;
              })
              .catch((error) => {
                removeListeners();
                reject(error);
              });
          }
          else {
            accumulation = finalReducer(accumulation, event);
          }
        }
        catch (error) {
          removeListeners();
          accumulation = Promise.reject(error);
          reject(error);
        }
      }
    };

    const onEnd = () => {
      // console.log('transduce listener end');

      removeListeners();

      accumulation = Promise.resolve(accumulation)
        .then((fulfilledAccumulation) => finalReducer(fulfilledAccumulation, { done: true }))
        .then(resolve, reject);
    };

    stream
      .on('data', onData)
      .on('end', onEnd)
      .resume();
  });

  return (stream) => {
    if (stream.internals.consumer) {
      throw new StreamError('Stream already being consumed.');
    }
    const transducerPromise = stream.internals.stream.then(consumeStream);
    stream.internals.consumer = transducerPromise;
    return transducerPromise;
  };
}

function transduceToStream<ConsumedT, ProducedT>(transformer: ReducerTransformer<ConsumedT, ProducedT, any>): (Stream<ConsumedT>) => Stream<ProducedT> {
  const transducer = transduce(transformer, reduceInternalStream, () => new InternalStream());
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
  let currentSeed = seed;
  return wrapReadableStream(new InternalStream(
    (push) => {
      if (currentSeed instanceof Promise) {
        currentSeed = currentSeed
          .then((seed) => producer(push, seed))
          .catch((error) => push({ error }));
      }
      else {
        try {
          currentSeed = producer(push, currentSeed);
        }
        catch (error) {
          push({ error });
        }
      }
    }
  ));
}

function fromReadable<T>(readable: stream.Readable): Stream<T> {
  const internalStream = new InternalStream();
  const dataListener = (value) => {
    internalStream.pushEvent({ value });
  };
  const errorListener = (error) => {
    internalStream.pushEvent({ error });
    readable
      .removeListener('data', dataListener)
      .removeListener('error', errorListener)
      .removeListener('end', endListener);
  };
  const endListener = () => {
    internalStream.pushEvent({ done: true });
    readable
      .removeListener('data', dataListener)
      .removeListener('error', errorListener)
      .removeListener('end', endListener);
  };
  readable
    .on('data', dataListener)
    .on('error', errorListener)
    .on('end', endListener)
    .resume();

  return wrapReadableStream(internalStream);
}

function fromIterable<T>(iterable: Iterable<T>): Stream<T> {
  // $FlowFixMe bug in the Iterable type of flow (cf. https://github.com/facebook/flow/issues/1163)
  const iterator: Iterator<T> = iterable[Symbol.iterator]();
  return wrapReadableStream(new InternalStream(
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

function from<T>(input: Iterable<T> | stream.Readable): Stream<T> {
  if (input instanceof Readable) {
    return fromReadable(input);
  }
  // $FlowFixMe bug in the Iterable type of flow (cf. https://github.com/facebook/flow/issues/1163)
  else if (input && typeof input[Symbol.iterator] === 'function') {
    return fromIterable(input);
  }
  else {
    return throwError(new StreamError('Unable to create a stream, \'from\' only supports iterable or Readable stream.'));
  }
}

function of<T>(...args: T[]): Stream<T> {
  return fromIterable(args);
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
