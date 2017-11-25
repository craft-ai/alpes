// @flow
const { transform } = require('./basics');

import type { Stream } from './basics';

type Tapper<T> = (value: T) => any;

function tap<T>(tapper: Tapper<T>): (Stream<T>) => Stream<T> {
  return transform((event, push) => {
    if (!event.error && !event.done) {
      tapper(event.value);
    }
    push(event);
  });
}

module.exports = {
  tap
};
