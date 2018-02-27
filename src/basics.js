// @flow
const { Readable } = require('stream');
const { StreamError } = require('./errors');
const { wrapInPromise } = require('./utils');
const { InternalStream, STREAM_STATUS } = require('./internalStream');

import type { Event, Producer as InternalStreamProducer, Push } from './internalStream';
import type stream from 'stream';

export interface Stream<T> {
  stream: Promise<InternalStream<T>>,
  consumer?: any,
  thru<R, Fn: (Stream<T>) => R>(f: Fn): R
}

function createStream<T>(stream: InternalStream<T> | Promise<InternalStream<T>>): Stream<T> {
  return {
    stream: stream instanceof Promise ? stream : Promise.resolve(stream),
    thru<R, Fn: (Stream<T>) => R>(f: Fn): R {
      return f(this);
    }
  };
}

export type ReducerResult<T> = Promise<{| accumulation: T, done: ?boolean |}> | {| accumulation: T, done: ?boolean |}
export type Reducer<T, AccumulationT> = (AccumulationT, Event<T>) => ReducerResult<AccumulationT>;
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
    if (stream.consumer) {
      throw new StreamError('Stream already being consumed.');
    }
    const transducerPromise = stream.stream.then(consumeStream);
    stream.consumer = transducerPromise;
    return transducerPromise.then(({ accumulation }) => accumulation);
  };
}

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

function transduceToStream<ConsumedT, ProducedT>(transformer: ReducerTransformer<ConsumedT, ProducedT, any>): (Stream<ConsumedT>) => Stream<ProducedT> {
  const transducer = transduce(transformer, reduceInternalStream, () => new InternalStream());
  return (stream) => createStream(transducer(stream));
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

  return createStream(new InternalStream(internalProducer));
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

  return createStream(internalStream);
}

function fromIterable<T>(iterable: Iterable<T>): Stream<T> {
  // $FlowFixMe bug in the Iterable type of flow (cf. https://github.com/facebook/flow/issues/1163)
  const iterator: Iterator<T> = iterable[Symbol.iterator]();
  return createStream(new InternalStream(
    (push: Push<T>) => {
      let continueProduction = true;
      while (continueProduction) {
        const iteratorResult = iterator.next();
        if (iteratorResult.done) {
          push({ done: true });
          continueProduction = false;
        }
        else {
          continueProduction = push({ value: iteratorResult.value });
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
