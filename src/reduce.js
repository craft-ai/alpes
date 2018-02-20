// @flow
const { transduce } = require('./basics');

import type { Stream } from './basics';

type Reducer<ConsumedT, ProducedT> = (acc: ?ProducedT, value: ConsumedT) => ?ProducedT | Promise<?ProducedT>;

function reduce<ConsumedT, ProducedT>(reducer: Reducer<ConsumedT, ProducedT>, seed?: ProducedT): (Stream<ConsumedT>) => Promise<?ProducedT> {
  return transduce(
    undefined,
    (accumulation, event) => {
      if (event.error) {
        throw event.error;
      }
      else if (event.done) {
        return { accumulation, done: true };
      }
      else {
        const result = reducer(accumulation, event.value);
        if (result instanceof Promise) {
          return result.then((accumulation) => ({ accumulation, done: false }));
        }
        else {
          return { accumulation: result, done: false };
        }
      }
    },
    () => seed);
}

module.exports = {
  reduce
};
