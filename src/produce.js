const { createBaseStream } = require('./baseStream');

function produce(producer, seed) {
  let currentSeed = seed;
  const internalProducer = (push, done) => {
    if (done) {
      return;
    }
    try {
      const producerResult = producer(push, currentSeed);
      if (producerResult instanceof Promise) {
        return producerResult
          .then((updatedSeed) => {
            currentSeed = updatedSeed;
            return;
          })
          .catch((error) => {
            push({ error });
            return;
          });
      } else {
        currentSeed = producerResult;
        return;
      }
    } catch (error) {
      push({ error });
      return;
    }
  };

  return createBaseStream(internalProducer);
}

module.exports = {
  produce
};
