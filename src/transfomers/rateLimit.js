const { transduceToStream } = require('./transduce');
const delay = require('../basics/delay');

function createRateLimitTransformer(interval) {
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
      } else {
        // We need to temporize this next event
        return delay(minNextEventTime - eventTime).then(() => {
          minNextEventTime += interval;
          return reducer(accumulation, event);
        });
      }
    };
  };
}

function rateLimit(interval) {
  return transduceToStream(createRateLimitTransformer(interval));
}

module.exports = {
  rateLimit
};
