// @flow
const { transduce } = require('./basics');

import type { Stream } from './basics';

function drain<T>(): (Stream<T>) => Promise<void> {
  const nothing: void = undefined;
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
        return { accumulation, done: false };
      }
    },
    () => nothing);
}

module.exports = {
  drain
};
