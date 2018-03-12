// @flow
const { transduce } = require('./transduce');

import type { Event, Stream } from './basics';

type Subscriber<T> = (event: Event<T>) => Promise<void> | void;

function subscribe<T>(subscriber: Subscriber<T>): (Stream<T>) => Promise<void> {
  return transduce(
    undefined,
    (_, event) => {
      const result = subscriber(event);
      const done = event.done || (event.error && true);
      if (result instanceof Promise) {
        return result.then(() => ({
          accumulation: undefined,
          done
        }));
      }
      return {
        accumulation: undefined,
        done
      };
    },
    () => undefined);
}

module.exports = {
  subscribe
};
