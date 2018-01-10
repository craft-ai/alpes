// @flow
const { transduce } = require('./basics');

import type { Stream } from './basics';

function drain<T>(): (Stream<T>) => Promise<void> {
  return transduce(
    undefined,
    (drainPromise, event) => {
      if (drainPromise) {
        return drainPromise;
      }
      else if (event.error) {
        return Promise.reject(event.error);
      }
      else if (event.done) {
        return Promise.resolve();
      }
      else {
        return undefined;
      }
    },
    () => undefined);
}

module.exports = {
  drain
};
