// @flow
const { transform } = require('./basics');

import type { Stream } from './basics';

type Mapper<ConsumedT, ProducedT> = (value: ConsumedT) => ProducedT;

function map<ConsumedT, ProducedT>(mapper: Mapper<ConsumedT, ProducedT>): (Stream<ConsumedT>) => Stream<ProducedT> {
  return transform((event, push) => {
    if (!event.error && !event.done) {
      try {
        push({ value: mapper(event.value) });
      }
      catch (error) {
        push({ error });
      }
    }
    else {
      push(event);
    }
  });
}

module.exports = {
  map
};
