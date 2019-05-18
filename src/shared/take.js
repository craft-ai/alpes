const { transduceToStream } = require('./transduce');

function createTakeTransformer(count) {
  return (reducer) => {
    let takenCount = 0;
    return (accumulation, event) => {
      if (event.error) {
        return reducer(accumulation, { error: event.error });
      }
      if (event.done || takenCount >= count) {
        return reducer(accumulation, { done: true });
      }
      ++takenCount;
      return reducer(accumulation, event);
    };
  };
}

function take(count) {
  return transduceToStream(createTakeTransformer(count));
}

module.exports = {
  take
};
