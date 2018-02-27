// @flow
const { transduce } = require('./basics');

import type { Stream } from './basics';

function drain<T>(): (Stream<T>) => Promise<void> {
  return transduce(
    undefined,
    (accumulation, event) => {
      if (event.error) {
        throw event.error;
      }

      return { accumulation, done: event.done };
    },
    () => {});
}

module.exports = {
  drain
};
