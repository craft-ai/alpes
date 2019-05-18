const { transduceToStream } = require('./transduce');
const { mergeStream } = require('./merge');
const { concatStream } = require('./concat');

function createMapperTransformer(mapper) {
  return (reducer) => (accumulation, event) => {
    if (event.error) {
      return reducer(accumulation, { error: event.error });
    } else if (event.done) {
      return reducer(accumulation, { done: true });
    }
    try {
      const mappedValue = mapper(event.value);
      return reducer(accumulation, { value: mappedValue });
    } catch (error) {
      return reducer(accumulation, { error });
    }
  };
}

function map(mapper) {
  const reducerTransformer = createMapperTransformer(mapper);
  const transducer = transduceToStream(reducerTransformer);
  return transducer;
}

function chain(mapper) {
  const reducerTransformer = createMapperTransformer(mapper);
  const transducer = transduceToStream(reducerTransformer, mergeStream);
  return transducer;
}

function concatMap(mapper) {
  const reducerTransformer = createMapperTransformer(mapper);
  const transducer = transduceToStream(reducerTransformer, concatStream);
  return transducer;
}

module.exports = {
  chain,
  concatMap,
  map,
  mergeMap: chain
};
