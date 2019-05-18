const { transduceToStream } = require('./transduce');

function scan(scanner, seed) {
  return transduceToStream((reducer) => {
    let prevProducedValue = seed;
    return (accumulation, event) => {
      if (event.error) {
        return reducer(accumulation, { error: event.error });
      } else if (event.done) {
        return reducer(accumulation, { done: true });
      }
      try {
        const result = scanner(prevProducedValue, event.value);
        if (result instanceof Promise) {
          return result.then((producedValue) => {
            prevProducedValue = producedValue;
            return reducer(accumulation, { value: producedValue });
          });
        } else {
          prevProducedValue = result;
          return reducer(accumulation, { value: result });
        }
      } catch (error) {
        return reducer(accumulation, { error });
      }
    };
  });
}

module.exports = {
  scan
};
