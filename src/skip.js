// @flow
const { transduceToStream } = require('./transduce');

import type { Stream } from './basics';
import type { Transformer } from './transduce';

function createSkipTransformer<T, AccumulationT>(count: number): Transformer<T, T, AccumulationT> {
  return (reducer) => {
    let skippedCount = 0;
    return (accumulation, event) => {
      if (event.error) {
        return reducer(accumulation, { error: event.error });
      }
      if (event.done) {
        return reducer(accumulation, { done: true });
      }
      if (skippedCount >= count) {
        return reducer(accumulation, event);
      }
      ++skippedCount;
      return { accumulation, done: false };
    };
  };
}

function skip<T>(count: number): (Stream<T>) => Stream<T> {
  return transduceToStream(createSkipTransformer(count));
}

module.exports = {
  skip
};
