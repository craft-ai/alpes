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
    else if (currentSeed instanceof Promise) {
      currentSeed = currentSeed
        .then((seed) => {
          if (!done) {
            return producer(push, seed);
          }
          return seed;
        })
        .catch((error) => { push({ error }); });
      return currentSeed.then(() => (void 0));
    }
    else {
      try {
        currentSeed = producer(push, currentSeed);
        return;
      }
      catch (error) {
        push({ error });
      }
    }
  };

  return createBaseStream(internalProducer);
}

module.exports = {
  produce
};
