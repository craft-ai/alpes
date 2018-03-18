// @flow
const { mergeStream, transduceToStream } = require('./transduce');

import type { Stream } from './basics';
import type { Transformer } from './transduce';

type Mapper<ConsumedT, ProducedT> = (value: ConsumedT) => ProducedT;

function createMapperTransformer<ConsumedT, ProducedT, AccumulationT>(mapper: Mapper<ConsumedT, ProducedT>): Transformer<ConsumedT, ProducedT, AccumulationT> {
  return (reducer) => (accumulation, event) => {
    if (event.error) {
      return reducer(accumulation, { error: event.error });
    }
    else if (event.done) {
      return reducer(accumulation, { done: true });
    }
    try {
      const mappedValue: ProducedT = mapper(event.value);
      return reducer(accumulation, { value: mappedValue });
    }
    catch (error) {
      return reducer(accumulation, { error });
    }
  };
}

function map<ConsumedT, ProducedT>(mapper: Mapper<ConsumedT, ProducedT>): (Stream<ConsumedT>) => Stream<ProducedT> {
  const reducerTransformer: Transformer<ConsumedT, ProducedT, void> = createMapperTransformer(mapper);
  const transducer: (Stream<ConsumedT>) => Stream<ProducedT> = transduceToStream(reducerTransformer);
  return transducer;
}

function chain<ConsumedT, ProducedT>(mapper: Mapper<ConsumedT, Stream<ProducedT>>): (Stream<ConsumedT>) => Stream<ProducedT> {
  const reducerTransformer: Transformer<ConsumedT, Stream<ProducedT>, void> = createMapperTransformer(mapper);
  // $FlowFixMe
  const transducer: (Stream<ConsumedT>) => Stream<ProducedT> = transduceToStream(reducerTransformer, mergeStream);
  return transducer;
}

module.exports = {
  chain,
  map
};
