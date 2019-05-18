const { createStream } = require('../basics/stream');
const {
  AlreadyConsumedStreamError,
  ProduceEventOnceDoneStreamError,
  StreamError
} = require('../basics/errors');
const delay = require('../basics/delay');
const creators = require('../creators');
const combiners = require('../combiners');
const transformers = require('../transfomers');

const functionalCreators = Object.values(creators).reduce(
  (functionalCreators, creator) => {
    functionalCreators[creator.name] = (...args) =>
      creator(...args)(createStream);
    return functionalCreators;
  },
  {}
);

module.exports = {
  AlreadyConsumedStreamError,
  ProduceEventOnceDoneStreamError,
  StreamError,
  delay,
  ...transformers,
  ...functionalCreators,
  ...combiners
};
