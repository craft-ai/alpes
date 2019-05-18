const { transduceToStream } = require('./transduce');

function createBatchTransformer(count) {
  return (reducer) => {
    const batch = new Array(count > 0 ? count : 0); // The batch that is being filled up
    let batchedCount = 0; // The number of already batched events

    return (accumulation, event) => {
      if (event.error) {
        return reducer(accumulation, { error: event.error });
      }

      if (event.done) {
        if (batchedCount > 0) {
          const reducerResult = reducer(accumulation, {
            value: batch.slice(0, batchedCount)
          });
          if (reducerResult instanceof Promise) {
            return reducerResult.then(({ accumulation }) =>
              reducer(accumulation, { done: true })
            );
          }
          return reducer(reducerResult.accumulation, { done: true });
        }
        return reducer(accumulation, { done: true });
      }

      batch[batchedCount] = event.value;
      ++batchedCount;
      if (batchedCount >= count) {
        batchedCount = 0;
        return reducer(accumulation, { value: batch.slice() });
      }
      return { accumulation, done: false };
    };
  };
}

function batch(count) {
  return transduceToStream(createBatchTransformer(count));
}

module.exports = {
  batch
};
