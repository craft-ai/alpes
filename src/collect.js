const { transduce } = require('./transduce');

function collect() {
  return transduce(
    undefined,
    (accumulation, event) => {
      if (event.error) {
        throw event.error;
      }

      if (!event.done) {
        accumulation.push(event.value);
      }

      return { accumulation, done: event.done };
    },
    () => []
  );
}

module.exports = {
  collect
};
