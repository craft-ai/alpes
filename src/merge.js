// @flow
const { createBaseStream } = require('./baseStream');
const { StreamError } = require('./errors');
//const { strFromEvent } = require('./basics');

import type { Stream } from './basics';

function merge<T>(...streams: Stream<T>[]): Stream<T> {
  if (streams.length == 0) {
    throw new StreamError('\'merge\' needs to be provided with at least one stream.');
  }
  if (streams.length == 1) {
    return streams[0];
  }
  const mergedStream = createBaseStream();
  const streamsDone = streams.map(() => false);
  let mergedStreamDone = false;
  streams.forEach((stream: Stream<T>, index: number) => {
    stream.consume((event) => {
      // If the merged stream is done let's stop everything.
      if (mergedStreamDone) {
        return true;
      }
      // console.log(`Stream #${index} - Event ${strFromEvent(event)}`);
      if (event.done) {
        streamsDone[index] = true;
        mergedStreamDone = streamsDone.every((done) => done);
        if (!mergedStreamDone) {
          // Ignoring the 'done' events if not all the stream has ended.
          return false;
        }
      }
      else if (event.error) {
        mergedStreamDone = true;
      }

      // Pushing every other events
      const pushResult = mergedStream.push(event);
      if (pushResult instanceof Promise) {
        return pushResult.then(() => mergedStreamDone);
      }
      else {
        return mergedStreamDone;
      }
    });
  });
  return mergedStream;
}

module.exports = {
  merge
};
