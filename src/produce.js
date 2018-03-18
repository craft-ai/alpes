// @flow
const { createBaseStream } = require('./baseStream');

import type { Producer as BaseProducer, Push, Stream } from './basics';

export type Producer<ProducedT, SeedT> = (push: Push<ProducedT>, seed: ?SeedT) => ?SeedT | Promise<?SeedT>;

function produce<ProducedT, SeedT>(producer: Producer<ProducedT, SeedT>, seed: ?SeedT): Stream<ProducedT> {
  let currentSeed = seed;
  const internalProducer: BaseProducer<ProducedT> = (push, done) => {
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
      }
      else {
        currentSeed = producerResult;
        return;
      }
    }
    catch (error) {
      push({ error });
      return;
    }
  };

  return createBaseStream(internalProducer);
}

module.exports = {
  produce
};
