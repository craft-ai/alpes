// @flow
const { subscribe, transform } = require('./basics');
const { wrapInPromise } = require('./utils');

import type { Stream, Transformer } from './basics';

type ReducerP<ConsumedT, ProducedT> = (acc: ?ProducedT, value: ConsumedT) => Promise<?ProducedT>;
type Reducer<ConsumedT, ProducedT> = (acc: ?ProducedT, value: ConsumedT) => ?ProducedT | Promise<?ProducedT>;

function reduce<ConsumedT, ProducedT>(reducer: Reducer<ConsumedT, ProducedT>, initialAcc?: ProducedT): (Stream<ConsumedT>) => Promise<?ProducedT> {
  const wrappedReducer: ReducerP<ConsumedT, ProducedT> = wrapInPromise(reducer);
  const transformer: Transformer<ConsumedT, ?ProducedT, ProducedT> = (event, push, acc) => {
    if (event.error) {
      push({ error: event.error });
    }
    else if (event.done) {
      push({ value: acc });
      push({ done: true });
    }
    else {
      return wrappedReducer(acc, event.value).then((newAcc) => {
        return newAcc;
      });
    }
  };
  const transformStream = transform(transformer, initialAcc);

  return (stream) => {
    return new Promise((resolve, reject) => {
      subscribe((event) => {
        if (event.error) {
          reject(event.error);
        }
        else if (event.value) {
          resolve(event.value);
        }
      })(transformStream(stream));
    });
  };
}

module.exports = {
  reduce
};
