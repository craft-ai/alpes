const { createBaseStream } = require('../functional/baseStream');

function createConsumer(streams, streamsDone) {
  return (event) => {
    const pushResults = streams.map(
      (stream, index) => streamsDone[index] || stream.push(event)
    );
    if (pushResults.some((pushResult) => pushResult instanceof Promise)) {
      return Promise.all(pushResults.map(Promise.resolve.bind(Promise))).then(
        (pushResults) => {
          pushResults.forEach((done, index) => (streamsDone[index] = done));
          return streamsDone.every((done) => done);
        }
      );
    } else {
      // $FlowFixMe Flow does not understand this branching.
      pushResults;
      pushResults.forEach((done, index) => (streamsDone[index] = done));
      return streamsDone.every((done) => done);
    }
  };
}

function fork(count) {
  return (stream) => {
    const forks = new Array(count)
      .fill(null) // Needed to have an array wih assigned value.
      .map(() => createBaseStream());
    const forksDone = forks.map(() => false);
    const consumer = createConsumer(forks, forksDone);
    stream.consume(consumer).catch((error) => {
      /* istanbul ignore next */
      console.warn("fork's consumer error, this should never occur", error); // eslint-disable-line no-console
    });
    return forks;
  };
}

module.exports = {
  fork
};
