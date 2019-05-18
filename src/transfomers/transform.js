const { transduceToStream } = require('./transduce');
const wrapInPromise = require('../basics/wrapInPromise');

function transform(transformer, seed) {
  const reducerTransformer = (reducer) => {
    const wrappedTransformer = wrapInPromise(transformer);
    let currentSeed = seed;
    return (accumulation, consumedEvent) => {
      let result = { accumulation, done: false };
      return wrappedTransformer(
        consumedEvent,
        (producedEvent) => {
          if (result instanceof Promise) {
            result = result.then(({ accumulation }) =>
              reducer(accumulation, producedEvent)
            );
            return false;
          } else {
            result = reducer(result.accumulation, producedEvent);
            if (result instanceof Promise) {
              return false;
            } else {
              return !result.done;
            }
          }
        },
        currentSeed
      ).then((newSeed) => {
        currentSeed = newSeed;
        return result;
      });
    };
  };

  return transduceToStream(reducerTransformer);
}

module.exports = {
  transform
};
