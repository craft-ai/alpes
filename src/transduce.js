// @flow
const { createBaseStream } = require('./baseStream');
// const { strFromEvent } = require('./basics');

import type { Event, Stream } from './basics';

type SyncReducerResult<T> = {| accumulation: T, done: ?boolean |}
type AsyncReducerResult<T> = Promise<SyncReducerResult<T>>
export type ReducerResult<T> = AsyncReducerResult<T> | SyncReducerResult<T>
export type Reducer<T, AccumulationT> = (AccumulationT, Event<T>) => ReducerResult<AccumulationT>;
export type Transformer<T, TransformedT, AccumulationT> = (Reducer<TransformedT, AccumulationT>) => Reducer<T, AccumulationT>;
export type Seeder<AccumulationT> = () => AccumulationT;

function transduce<T, TransformedT, AccumulationT>(
  transformer?: Transformer<T, TransformedT, AccumulationT>,
  reducer: Reducer<TransformedT, AccumulationT>,
  seeder: Seeder<AccumulationT>): (Stream<T>) => Promise<AccumulationT> {

  const consumeStream = (stream) => {
    // $FlowFixMe it seems the T == TransformedT case is not well handled...
    const finalReducer: Reducer<T, AccumulationT> = transformer ? transformer(reducer) : reducer;
    let finalAccumulation = seeder();

    return stream.consume((event) => {
      //console.log(`${stream.toString()} - consume(${strFromEvent(event)})`);
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

  return (stream) => consumeStream(stream);
}

export type StreamReducer<T, AccumulationT> = (Stream<AccumulationT>) => (Event<T>) => Promise<boolean> | boolean;

function concatEvent<T>(stream: Stream<T>) {
  return (event: Event<T>): Promise<boolean> | boolean => {
    // console.log(`concatEvent(${stream.toString()}, ${strFromEvent(event)})`);
    const pushResult = stream.push(event);
    if (pushResult instanceof Promise) {
      return pushResult.then((done) => done);
    }
    else {
      return pushResult;
    }
  };
}

function reducerFromStreamReducer<TransformedT, AccumulationT>(
  reducer: StreamReducer<TransformedT, AccumulationT>,
  stream: Stream<AccumulationT>): Reducer<TransformedT, void> {
  const outputStreamReducer = reducer(stream);
  return (accumulation: void, event: Event<TransformedT>) => {
    // console.log(`${stream.toString()} - reduce(${strFromEvent(event)})`);
    const done = outputStreamReducer(event);
    if (done instanceof Promise) {
      return done.then((done) => ({
        accumulation,
        done
      }));
    }
    else {
      return {
        accumulation,
        done
      };
    }
  };
}

function nullSeeder() {
  return;
}

function transduceToStream<T, TransformedT, AccumulationT>(
  transformer?: Transformer<T, TransformedT, void>,
  // $FlowFixMe
  reducer: StreamReducer<TransformedT, AccumulationT> = concatEvent,
  seeder: Seeder<Stream<AccumulationT>> = createBaseStream): (Stream<T>) => Stream<AccumulationT> {
  return (inputStream) => {
    const outputStream = seeder();
    transduce(
      transformer,
      reducerFromStreamReducer(reducer, outputStream),
      nullSeeder)(inputStream)
      .catch((error) => outputStream.push({ error }));
    return outputStream;
  };
}

module.exports = {
  concatEvent,
  transduce,
  transduceToStream
};
