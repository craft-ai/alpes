// @flow
const { Readable } = require('stream');
const { StreamError } = require('./errors');
const { wrapInPromise } = require('./utils');
const { InternalStream, strFromEvent } = require('./internalStream');

import type { Event, Producer as InternalStreamProducer, Push } from './internalStream';
import type stream from 'stream';

export interface Stream<T> {
  stream: Promise<InternalStream<T>>,
  consuming: boolean,
  thru<R, Fn: (Stream<T>) => R>(f: Fn): R
}

function createStream<T>(stream: InternalStream<T> | Promise<InternalStream<T>>): Stream<T> {
  return {
    stream: stream instanceof Promise ? stream : Promise.resolve(stream),
    consuming: false,
    thru<R, Fn: (Stream<T>) => R>(f: Fn): R {
      return f(this);
    }
  };
}

type SyncReducerResult<T> = {| accumulation: T, done: ?boolean |}
type AsyncReducerResult<T> = Promise<SyncReducerResult<T>>
export type ReducerResult<T> = AsyncReducerResult<T> | SyncReducerResult<T>
export type Reducer<T, AccumulationT> = (AccumulationT, Event<T>) => ReducerResult<AccumulationT>;
export type ReducerTransformer<T, TransformedT, AccumulationT> = (Reducer<TransformedT, AccumulationT>) => Reducer<T, AccumulationT>;
export type Seeder<AccumulationT> = () => AccumulationT;

function transduce<T, TransformedT, AccumulationT>(
  transformer?: ReducerTransformer<T, TransformedT, AccumulationT>,
  reducer: Reducer<TransformedT, AccumulationT>,
  seeder: Seeder<AccumulationT>): (Stream<T>) => Promise<AccumulationT> {

  const consumeStream = (stream) => {
    // $FlowFixMe it seems the T == TransformedT case is not well handled...
    const finalReducer: Reducer<T, AccumulationT> = transformer ? transformer(reducer) : reducer;
    let finalAccumulation = seeder();

    return stream.consume((event) => {
      const reducerResult = finalReducer(finalAccumulation, event);
      if (reducerResult instanceof Promise) {
        return reducerResult.then(({ accumulation, done }) => {
          finalAccumulation = accumulation;
          return !!done;
        });
      }
      else {
        const { accumulation, done } = reducerResult;
        finalAccumulation = accumulation;
        return !!done;
      }
    })
      .then(() => finalAccumulation);
  };

  return (stream) => {
    if (stream.consuming) {
      throw new StreamError('Stream already being consumed.');
    }
    const transducerPromise = stream.stream.then(consumeStream);
    stream.consuming = true;
    return transducerPromise;
  };
}

function createReduceInternalStreamResult<T>(stream: InternalStream<T>, event: Event<T>): SyncReducerResult<InternalStream<T>> {
  return {
    accumulation: stream,
    done: event.done || (event.error && true)
  };
}

function reduceInternalStream<T>(stream: InternalStream<T>, event: Event<T>): ReducerResult<InternalStream<T>> {
  const waitAndPushResult = stream.waitAndPush(event);
  if (waitAndPushResult instanceof Promise) {
    return waitAndPushResult.then(createReduceInternalStreamResult.bind(null, stream, event));
  }
  else {
    return createReduceInternalStreamResult(stream, event);
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
      let result = { accumulation, done: false };
      return wrappedTransformer(
        consumedEvent,
        (producedEvent) => {
          if (result instanceof Promise) {
            result = result
              .then(({ accumulation }) => reducer(accumulation, producedEvent));
            return false;
          }
          else {
            result = reducer(result.accumulation, producedEvent);
            if (result instanceof Promise) {
              return false;
            }
            else {
              return !result.done;
            }
          }
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
  const internalProducer: InternalStreamProducer<ProducedT> = (push, done) => {
    if (done) {
      return;
    }
    else if (currentSeed instanceof Promise) {
      currentSeed = currentSeed
        .then((seed) => {
          if (!done) {
            return producer(push, seed);
          }
          return seed;
        })
        .catch((error) => { push({ error }); });
      return currentSeed.then(() => (void 0));
    }
    else {
      try {
        currentSeed = producer(push, currentSeed);
        return;
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
  const removeListeners = () => {
    readable
      .removeListener('data', dataListener)
      .removeListener('error', errorListener)
      .removeListener('end', endListener);
  };
  const dataListener = (value) => {
    const ready = internalStream.waitAndPush({ value });
    if (ready instanceof Promise) {
      readable.pause();
      ready.then((ready) => {
        if (ready) {
          readable.resume();
        }
        else {
          // The only way it's not ready for more is that the consumer is done.
          removeListeners();
        }
      });
    }
    else if (!ready) {
      // The only way it's not ready for more is that the consumer is done.
      removeListeners();
    }
  };
  const errorListener = (error) => {
    internalStream.waitAndPush({ error });
    removeListeners();
  };
  const endListener = () => {
    internalStream.waitAndPush({ done: true });
    removeListeners();
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
