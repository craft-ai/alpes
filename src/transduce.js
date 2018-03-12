// @flow
const { createBaseStream } = require('./baseStream');

import type { Event, Stream } from './basics';

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

  return (stream) => consumeStream(stream);
}

function transduceToStream<ConsumedT, ProducedT>(transformer: ReducerTransformer<ConsumedT, ProducedT, any>): (Stream<ConsumedT>) => Stream<ProducedT> {
  return (stream) => {
    const reducedStream = createBaseStream();
    const reducer = (accumulation, event) => {
      const pushResult = reducedStream.push(event);
      const result = {
        accumulation: undefined,
        done: event.done || (event.error && true)
      };
      if (pushResult instanceof Promise) {
        return pushResult.then(() => result);
      }
      else {
        return result;
      }
    };
    transduce(transformer, reducer, () => (void 0))(stream)
      .catch((error) => reducedStream.push({ error }));
    return reducedStream;
  };
}

module.exports = {
  transduce,
  transduceToStream
};
