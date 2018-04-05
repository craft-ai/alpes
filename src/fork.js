// @flow
const { createBaseStream } = require('./baseStream');

import type { Consumer, Event, Stream } from './basics';

function createConsumer<T>(streams: Stream<T>[], streamsDone: boolean[]): Consumer<T> {
  return (event: Event<T>): Promise<boolean> | boolean => {
    const pushResults = streams.map((stream, index) => streamsDone[index] || stream.push(event));
    if (pushResults.some((pushResult) => pushResult instanceof Promise)) {
      return Promise.all(pushResults.map(Promise.resolve.bind(Promise)))
        .then((pushResults) => {
          pushResults.forEach((done, index) => streamsDone[index] = done);
          return streamsDone.every((done) => done);
        });
    }
    else {
      // $FlowFixMe Flow does not understand this branching.
      (pushResults: boolean[]);
      pushResults.forEach((done, index) => streamsDone[index] = done);
      return streamsDone.every((done) => done);
    }
  };
}

function fork<T>(count: number): (Stream<T>) => Stream<T>[]{
  return (stream: Stream<T>) => {
    const forks = (new Array(count))
      .fill(null) // Needed to have an array wih assigned value.
      .map(() => createBaseStream());
    const forksDone = forks.map(() => false);
    const consumer = createConsumer(forks, forksDone);
    stream
      .consume(consumer)
      .catch((error) => {
        /* istanbul ignore next */
        console.warn('fork\'s consumer error, this should never occur', error);
      });
    return forks;
  };
}

module.exports = {
  fork
};
