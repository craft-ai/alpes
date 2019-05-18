const { transduceToStream } = require('./transduce');

function createTapperTransformer(tapper) {
  return (reducer) => (accumulation, event) => {
    if (!event.error && !event.done) {
      tapper(event.value);
    }
    return reducer(accumulation, event);
  };
}

function tap(tapper) {
  return transduceToStream(createTapperTransformer(tapper));
}

module.exports = {
  tap
};
