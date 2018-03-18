// @flow
const { transduceToStream } = require('./transduce');

import type { Stream } from './basics';
import type { Transformer } from './transduce';

type Tapper<T> = (value: T) => any;

function createTapperTransformer<T, AccumulationT>(tapper: Tapper<T>): Transformer<T, T, AccumulationT> {
  return (reducer) => (accumulation, event) => {
    if (!event.error && !event.done) {
      tapper(event.value);
    }
    return reducer(accumulation, event);
  };
}

function tap<T>(tapper: Tapper<T>): (Stream<T>) => Stream<T> {
  return transduceToStream(createTapperTransformer(tapper));
}

module.exports = {
  tap
};
