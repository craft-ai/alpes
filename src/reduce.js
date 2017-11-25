// @flow
const { drain, transform } = require('./basics');
const { tap } = require('./tap');
const { wrapInPromise } = require('./utils');

import type { Stream, Transformer } from './basics';

type ReducerP<ConsumedT, ProducedT> = (acc: ?ProducedT, value: ConsumedT) => Promise<?ProducedT>;
type Reducer<ConsumedT, ProducedT> = (acc: ?ProducedT, value: ConsumedT) => ?ProducedT | Promise<?ProducedT>;

function reduce<ConsumedT, ProducedT>(reducer: Reducer<ConsumedT, ProducedT>, initialAcc?: ProducedT): (Stream<ConsumedT>) => Promise<?ProducedT> {
  const wrappedReducer: ReducerP<ConsumedT, ProducedT> = wrapInPromise(reducer);
  const drainStream = drain();
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
    let value;
    return drainStream(
      tap((v) => { value = v; })(
        transformStream(stream)
      )
    )
      .then(() => value);
  };
}

module.exports = {
  reduce
};
