const { transduceToStream } = require('./transduce');

function createSkipTransformer(count) {
  return (reducer) => {
    let skippedCount = 0;
    return (accumulation, event) => {
      if (event.error) {
        return reducer(accumulation, { error: event.error });
      }
      if (event.done) {
        return reducer(accumulation, { done: true });
      }
      if (skippedCount >= count) {
        return reducer(accumulation, event);
      }
      ++skippedCount;
      return { accumulation, done: false };
    };
  };
}

function skip(count) {
  return transduceToStream(createSkipTransformer(count));
}

module.exports = {
  skip
};
