const { transduce } = require('./transduce');

function reduce(reducer, seed) {
  return transduce(
    undefined,
    (accumulation, event) => {
      if (event.error) {
        throw event.error;
      } else if (event.done) {
        return { accumulation, done: true };
      } else {
        const result = reducer(accumulation, event.value);
        if (result instanceof Promise) {
          return result.then((accumulation) => ({ accumulation, done: false }));
        } else {
          return { accumulation: result, done: false };
        }
      }
    },
    () => seed
  );
}

module.exports = {
  reduce
};
