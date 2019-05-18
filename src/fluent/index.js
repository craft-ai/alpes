const {
  DEFAULT_STREAM_CONFIGURATION,
  createStream
} = require('../basics/stream');
const {
  AlreadyConsumedStreamError,
  ProduceEventOnceDoneStreamError,
  StreamError
} = require('../basics/errors');
const delay = require('../basics/delay');
const creators = require('../creators');
const combiners = require('../combiners');
const transformers = require('../transfomers');

function createFluentStream(producer, cfg = DEFAULT_STREAM_CONFIGURATION) {
  const stream = createStream(producer, cfg);

  stream.createStream = (producer, childCfg = cfg) =>
    createFluentStream(producer, childCfg);

  Object.values(transformers).forEach((transformer) => {
    stream[transformer.name] = (...args) => transformer(...args)(stream);
  });

  stream.thru = (f) => f(stream);

  return stream;
}

const fluentCreators = Object.values(creators).reduce(
  (fluentCreators, creator) => {
    fluentCreators[creator.name] = (...args) =>
      creator(...args)(createFluentStream);
    return fluentCreators;
  },
  {}
);

module.exports = {
  AlreadyConsumedStreamError,
  ProduceEventOnceDoneStreamError,
  StreamError,
  delay,
  ...transformers, // Export the functional transformers also.
  ...combiners,
  ...fluentCreators
};
