// @flow
const { transduceToStream } = require('./transduce');

import type { Stream } from './basics';
import type { Transformer } from './transduce';

function createBatchTransformer<T, AccumulationT>(count: number): Transformer<T, T[], AccumulationT> {
  return (reducer) => {
    let currentBatch = undefined;
    return (accumulation, event) => {
      if (event.error) {
        return reducer(accumulation, { error: event.error });
      }

      if (event.done) {
        if (currentBatch != null) {
          const reducerResult = reducer(accumulation, { value: currentBatch });
          if (reducerResult instanceof Promise) {
            return reducerResult.then(({ accumulation }) => reducer(accumulation, { done: true }));
          }
          return reducer(reducerResult.accumulation, { done: true });
        }
        return reducer(accumulation, { done: true });
      }

      currentBatch = currentBatch || [];
      currentBatch.push(event.value);
      if (currentBatch.length >= count) {
        const sentBatch = currentBatch;
        currentBatch = undefined;
        return reducer(accumulation, { value: sentBatch });
      }
      return { accumulation, done: false };
    };
  };
}

function batch<T>(count: number): (Stream<T>) => Stream<T[]> {
  return transduceToStream(createBatchTransformer(count));
}

module.exports = {
  batch
};
