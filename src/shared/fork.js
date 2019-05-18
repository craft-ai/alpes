const { consume, createStream, push } = require('../basics/stream');

const promisifyVal = Promise.resolve.bind(Promise);

function createConsumer(streams, streamsDone) {
  return (event) => {
    const pushEvent = push(event);
    const pushResults = streams.map(
      (stream, index) => streamsDone[index] || pushEvent(stream)
    );
    if (pushResults.some((pushResult) => pushResult instanceof Promise)) {
      return Promise.all(pushResults.map(promisifyVal)).then((pushResults) => {
        pushResults.forEach((done, index) => (streamsDone[index] = done));
        return streamsDone.every((done) => done);
      });
    } else {
      pushResults.forEach((done, index) => (streamsDone[index] = done));
      return streamsDone.every((done) => done);
    }
  };
}

function fork(count) {
  return (stream) => {
    const forks = new Array(count)
      .fill(null) // Needed to have an array wih assigned value.
      .map(() => createStream());
    const forksDone = forks.map(() => false);
    const consumer = createConsumer(forks, forksDone);
    consume(consumer)(stream).catch((error) => {
      /* istanbul ignore next */
      console.warn("fork's consumer error, this should never occur", error); // eslint-disable-line no-console
    });
    return forks;
  };
}

module.exports = {
  fork
};
