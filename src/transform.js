// @flow
const { transduceToStream } = require('./basics');
const { wrapInPromise } = require('./utils');

import type { Event } from './event';
import type { Push } from './internalStream';
import type { Stream } from './basics';

export type Transformer<ConsumedT, ProducedT, SeedT = void> = (event: Event<ConsumedT>, push: Push<ProducedT>, seed: ?SeedT) => ?SeedT | Promise<?SeedT>;

function transform<ConsumedT, ProducedT, SeedT>(transformer: Transformer<ConsumedT, ProducedT, SeedT>, seed: ?SeedT): (Stream<ConsumedT>) => Stream<ProducedT> {
  const reducerTransformer = (reducer) => {
    const wrappedTransformer = wrapInPromise(transformer);
    let currentSeed = seed;
    return (accumulation, consumedEvent) => {
      let result = { accumulation, done: false };
      return wrappedTransformer(
        consumedEvent,
        (producedEvent) => {
          if (result instanceof Promise) {
            result = result
              .then(({ accumulation }) => reducer(accumulation, producedEvent));
            return false;
          }
          else {
            result = reducer(result.accumulation, producedEvent);
            if (result instanceof Promise) {
              return false;
            }
            else {
              return !result.done;
            }
          }
        },
        currentSeed)
        .then((newSeed) => {
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
