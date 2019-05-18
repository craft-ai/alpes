const { transduce } = require('./transduce');

function drain() {
  return transduce(
    undefined,
    (accumulation, event) => {
      if (event.error) {
        throw event.error;
      }

      return { accumulation, done: event.done };
    },
    () => {}
  );
}

module.exports = {
  drain
};
