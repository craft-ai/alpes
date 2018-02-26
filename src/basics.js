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

export type Push<T> = (Event<T>) => boolean;
type InternalStreamProducer<ProducedT> = (push: Push<ProducedT>, context: { status: StreamStatus }) => void;

class InternalStream<T> extends Readable {
  status: StreamStatus;
  constructor(producer: InternalStreamProducer<T> = (push) => {}) {
    super({
      objectMode: true,
      read() {
        producer(this.pushEvent.bind(this), this);
      }
    });
    this.status = STREAM_STATUS.OPEN;
  }
  pushEvent(event: Event<T>): boolean {
    if (this.status != STREAM_STATUS.OPEN) {
      // console.log('InternalStream.pushEvent push when not open', event);
      throw new StreamError('No event should be produced once the stream has ended.');
    }
    else if (event.done) {
      // console.log('InternalStream.pushEvent done');
      this.status = STREAM_STATUS.DONE;
      this.push(null);
      return false;
    }
    else if (event.error) {
      // console.log('InternalStream.pushEvent', event.error.toString());
      this.status = STREAM_STATUS.ERROR;
      // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
      this.push(event);
      this.push(null);
      return false;
    }
    else {
      // console.log('InternalStream.pushEvent', event.value);
      // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
      return this.push(event);
    }
  }
}

export type ReducerResult<T> = Promise<{| accumulation: T, done: ?boolean |}> | {| accumulation: T, done: ?boolean |}
export type Reducer<T, AccumulationT> = (AccumulationT, Event<T>) => ReducerResult<AccumulationT>;

function reduceInternalStream<T>(stream: InternalStream<T>, event: Event<T>): ReducerResult<InternalStream<T>> {
  // Only push when the stream is open !
  if (stream.status != STREAM_STATUS.OPEN) {
    return { accumulation: stream, done: true };
  }
  else {
    stream.pushEvent(event);
    const done = event.done || (event.error && true);
    return { accumulation: stream, done };
  }
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

export type ReducerTransformer<T, TransformedT, AccumulationT> = (Reducer<TransformedT, AccumulationT>) => Reducer<T, AccumulationT>;
export type Seeder<AccumulationT> = () => AccumulationT;

function transduce<T, TransformedT, AccumulationT>(
  transformer?: ReducerTransformer<T, TransformedT, AccumulationT>,
  reducer: Reducer<TransformedT, AccumulationT>,
  seeder: Seeder<AccumulationT>): (Stream<T>) => Promise<AccumulationT> {

  const consumeStream = (stream) => new Promise((resolve, reject) => {
    let result : ReducerResult<AccumulationT> = { accumulation: seeder(), done: false };
    // $FlowFixMe it seems the T == TransformedT case is not well handled...
    const finalReducer: Reducer<T, AccumulationT> = transformer ? transformer(reducer) : reducer;

    const start = () => {
      stream
        .on('data', onData)
        .on('end', onEnd)
        .resume();
    };
    const finish = () => {
      stream
        .pause()
        .removeListener('data', onData)
        .removeListener('end', onEnd);
    };
    const onData = (event) => {
      if (event.error) {
        // console.log('transduce listener error', event.error.toString());
        finish();

        result = Promise.resolve(result).then(({ accumulation, done }) => finalReducer(accumulation, event));
        result.then(resolve, reject);
      }
      else {
        // console.log('transduce listener value', event.value);
        if (result instanceof Promise) {
          // We only have a promise on the accumulation
          // -> Pause and resume after
          stream.pause();
          result = result
            .then(({ accumulation, done }) => {
              if (!done) {
                stream.resume();
                const updatedResult : ReducerResult<AccumulationT> = finalReducer(accumulation, event);
                return updatedResult;
              }
              return { accumulation, done };
            });
          result
            .then(({ done }) => {
              if (done) {
                // console.log('transduce reducer async done');
                finish();
                resolve(result);
              }
            })
            .catch((error) => {
              // console.log('transduce reducer async error', error.toString());
              finish();
              reject(error);
            });
        }
        else if (!result.done) {
          try {
            result = finalReducer(result.accumulation, event);
            if (result.done) {
              // console.log('transduce reducer sync done');
              finish();
              resolve(result);
            }
          }
          catch (error) {
            // console.log('transduce reducer sync error', error.toString());
            finish();
            result = Promise.reject(error);
            reject(error);
          }
        }
      }
    };

    const onEnd = () => {
      // console.log('transduce listener end');
      finish();

      result = Promise.resolve(result).then(({ accumulation, done }) => finalReducer(accumulation, { done: true }));
      result.then(resolve, reject);
    };

    start();
  });

  return (stream) => {
    if (stream.internals.consumer) {
      throw new StreamError('Stream already being consumed.');
    }
    const transducerPromise = stream.internals.stream.then(consumeStream);
    stream.internals.consumer = transducerPromise;
    return transducerPromise.then(({ accumulation }) => accumulation);
  };
}

function transduceToStream<ConsumedT, ProducedT>(transformer: ReducerTransformer<ConsumedT, ProducedT, any>): (Stream<ConsumedT>) => Stream<ProducedT> {
  const transducer = transduce(transformer, reduceInternalStream, () => new InternalStream());
  return (stream) => wrapReadableStream(transducer(stream));
}

export type Transformer<ConsumedT, ProducedT, SeedT = void> = (event: Event<ConsumedT>, push: Push<ProducedT>, seed: ?SeedT) => ?SeedT | Promise<?SeedT>;

function transform<ConsumedT, ProducedT, SeedT>(transformer: Transformer<ConsumedT, ProducedT, SeedT>, seed: ?SeedT): (Stream<ConsumedT>) => Stream<ProducedT> {
  const reducerTransformer = (reducer) => {
    const wrappedTransformer = wrapInPromise(transformer);
    let currentSeed = seed;
    return (accumulation, consumedEvent) => {
      let result = Promise.resolve({ accumulation, done: false });
      return wrappedTransformer(
        consumedEvent,
        (producedEvent) => {
          const done = producedEvent.done || (producedEvent.error && true);
          result = result
            .then(({ accumulation }) => reducer(accumulation, producedEvent))
            .then(({ accumulation }) => ({ accumulation, done }));
          return !done;
        },
        currentSeed)
        .then((newSeed) => {
          currentSeed = newSeed;
          return result;
        });
    };
  };

  return transduceToStream(reducerTransformer);
}

type Subscriber<T> = (event: Event<T>) => Promise<void> | void;

function subscribe<T>(subscriber: Subscriber<T>): (Stream<T>) => Promise<void> {
  return transduce(
    undefined,
    (_, event) => {
      const result = subscriber(event);
      const done = event.done || (event.error && true);
      if (result instanceof Promise) {
        return result.then(() => ({
          accumulation: undefined,
          done
        }));
      }
      return {
        accumulation: undefined,
        done
      };
    },
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
  const internalProducer: InternalStreamProducer<ProducedT> = (push, context) => {
    if (currentSeed instanceof Promise) {
      currentSeed = currentSeed
        .then((seed) => {
          if (context.status == STREAM_STATUS.OPEN) {
            return producer(push, seed);
          }
          return seed;
        })
        .catch((error) => { push({ error }); });
    }
    else {
      try {
        currentSeed = producer(push, currentSeed);
      }
      catch (error) {
        push({ error });
      }
    }
  };

  return wrapReadableStream(new InternalStream(internalProducer));
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
      let continueProduction = true;
      while (continueProduction) {
        const { done, value } = iterator.next();
        if (done) {
          push({ done: true });
          continueProduction = false;
        }
        else {
          continueProduction = push({ value });
        }
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
