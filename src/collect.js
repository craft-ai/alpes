// @flow
const { transduce } = require('./transduce');

import type { Event, Stream } from './basics';

function collect<T>(): (Stream<T>) => Promise<T[]> {
  return transduce(
    undefined,
    (accumulation: T[], event: Event<T>) => {
      if (event.error) {
        throw event.error;
      }

      if (!event.done) {
        accumulation.push(event.value);
      }

      return { accumulation, done: event.done };
    },
    () => []);
}

module.exports = {
  collect
};
