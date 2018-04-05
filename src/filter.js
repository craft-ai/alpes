// @flow
const { transduceToStream } = require('./transduce');

import type { Stream } from './basics';
import type { Transformer } from './transduce';

type Filterer<T> = (value: T) => boolean;

function createFiltererTransformer<T, AccumulationT>(filterer: Filterer<T>): Transformer<T, T, AccumulationT> {
  return (reducer) => (accumulation, event) => {
    if (event.error) {
      return reducer(accumulation, { error: event.error });
    }
    else if (event.done) {
      return reducer(accumulation, { done: true });
    }
    try {
      const filtered = filterer(event.value);
      if (filtered) {
        return reducer(accumulation, { value: event.value });
      }
      return { accumulation, done: false };
    }
    catch (error) {
      return reducer(accumulation, { error });
    }
  };
}

function filter<T>(filterer: Filterer<T>): (Stream<T>) => Stream<T> {
  const reducerTransformer: Transformer<T, T, void> = createFiltererTransformer(filterer);
  const transducer: (Stream<T>) => Stream<T> = transduceToStream(reducerTransformer);
  return transducer;
}

module.exports = {
  filter
};
