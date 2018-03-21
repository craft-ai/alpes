// @flow
const { transduceToStream } = require('./transduce');

import type { Stream } from './basics';
import type { Transformer } from './transduce';

function createTakeTransformer<T, AccumulationT>(count: number): Transformer<T, T, AccumulationT> {
  return (reducer) => {
    let takenCount = 0;
    return (accumulation, event) => {
      if (event.error) {
        return reducer(accumulation, { error: event.error });
      }
      if (event.done || takenCount >= count) {
        return reducer(accumulation, { done: true });
      }
      ++takenCount;
      return reducer(accumulation, event);
    };
  };
}

function take<T>(count: number): (Stream<T>) => Stream<T> {
  return transduceToStream(createTakeTransformer(count));
}

module.exports = {
  take
};
