// @flow
const { transduceToStream } = require('./basics');

import type { Stream } from './basics';

type Tapper<T> = (value: T) => any;

function tap<T>(tapper: Tapper<T>): (Stream<T>) => Stream<T> {
  return transduceToStream((reducer) => (accumulation, event) => {
    if (!event.error && !event.done) {
      tapper(event.value);
    }
    return reducer(accumulation, event);
  });
}

module.exports = {
  tap
};
