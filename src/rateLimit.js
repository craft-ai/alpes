// @flow
const { transduceToStream } = require('./transduce');
const { delay } = require('./utils');

import type { Stream } from './basics';
import type { Transformer } from './transduce';

function createRateLimitTransformer<T, AccumulationT>(interval: number): Transformer<T, T, AccumulationT> {
  return (reducer) => {
    let minNextEventTime = 0;

    return (accumulation, event) => {
      if (event.error || event.done) {
        return reducer(accumulation, event);
      }

      const eventTime = Date.now();
      if (eventTime > minNextEventTime) {
        // The rate limit is respected, go go go
        minNextEventTime = eventTime + interval;
        return reducer(accumulation, event);
      }
      else {
        // We need to temporize this next event
        return delay(minNextEventTime - eventTime)
          .then(() => {
            minNextEventTime += interval;
            return reducer(accumulation, event);
          });
      }
    };
  };
}

function rateLimit<T>(interval: number): (Stream<T>) => Stream<T> {
  return transduceToStream(createRateLimitTransformer(interval));
}

module.exports = {
  rateLimit
};
