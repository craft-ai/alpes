const { transduceToStream } = require('./transduce');

function createFiltererTransformer(filterer) {
  return (reducer) => (accumulation, event) => {
    if (event.error) {
      return reducer(accumulation, { error: event.error });
    } else if (event.done) {
      return reducer(accumulation, { done: true });
    }
    try {
      const filtered = filterer(event.value);
      if (filtered) {
        return reducer(accumulation, { value: event.value });
      }
      return { accumulation, done: false };
    } catch (error) {
      return reducer(accumulation, { error });
    }
  };
}

function filter(filterer) {
  const reducerTransformer = createFiltererTransformer(filterer);
  const transducer = transduceToStream(reducerTransformer);
  return transducer;
}

module.exports = {
  filter
};
