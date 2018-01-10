// @flow
const { transduceToStream } = require('./basics');

import type { Stream } from './basics';

type Mapper<ConsumedT, ProducedT> = (value: ConsumedT) => ProducedT;

function map<ConsumedT, ProducedT>(mapper: Mapper<ConsumedT, ProducedT>): (Stream<ConsumedT>) => Stream<ProducedT> {
  return transduceToStream((reducer) => (accumulation, event) => {
    if (event.error) {
      return reducer(accumulation, { error: event.error });
    }
    else if (event.done) {
      return reducer(accumulation, { done: true });
    }
    else {
      try {
        return reducer(accumulation, { value: mapper(event.value) });
      }
      catch (error) {
        return reducer(accumulation, { error });
      }
    }
  });
}

module.exports = {
  map
};
