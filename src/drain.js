// @flow
const { subscribe } = require('./basics');
const { StreamError } = require('./errors');

import type { Stream } from './basics';

function drain<T>(): (Stream<T>) => Promise<void> {
  return (stream) => {
    if (stream.countConsumers() > 0) {
      throw new StreamError('Stream already being consumed.');
    }
    return new Promise((resolve, reject) => {
      subscribe((event) => {
        if (event.error) {
          reject(event.error);
        }
        else if (event.done) {
          resolve();
        }
      })(stream);
    });
  };
}

module.exports = {
  drain
};
