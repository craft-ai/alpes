const { transduce } = require('./transduce');

function subscribe(subscriber) {
  return transduce(
    undefined,
    (_, event) => {
      const result = subscriber(event);
      const done = event.done || (event.error && true);
      if (result instanceof Promise) {
        return result.then(() => ({
          accumulation: undefined,
          done
        }));
      }
      return {
        accumulation: undefined,
        done
      };
    },
    () => undefined
  );
}

module.exports = {
  subscribe
};
