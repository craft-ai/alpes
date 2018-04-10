// @flow
const { transduceToStream } = require('./transduce');

import type { Reducer } from './reduce';
import type { Stream } from './basics';

function scan<ConsumedT, ProducedT>(scanner: Reducer<ConsumedT, ProducedT>, seed?: ProducedT): (Stream<ConsumedT>) => Stream<ProducedT> {
  return transduceToStream((reducer) => {
    let prevProducedValue: ?ProducedT = seed;
    return (accumulation, event) => {
      if (event.error) {
        return reducer(accumulation, { error: event.error });
      }
      else if (event.done) {
        return reducer(accumulation, { done: true });
      }
      try {
        const result = scanner(prevProducedValue, event.value);
        if (result instanceof Promise) {
          return result.then((producedValue) => {
            prevProducedValue = producedValue;
            return reducer(accumulation, { value: producedValue });
          });
        }
        else {
          prevProducedValue = result;
          return reducer(accumulation, { value: result });
        }
      }
      catch (error) {
        return reducer(accumulation, { error });
      }
    };
  });
}

module.exports = {
  scan
};
