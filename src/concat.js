// @flow
const { StreamError } = require('./errors');
const { fromIterable } = require('./from');
const { concatEvent, transduceToStream } = require('./transduce');
//const { strFromEvent } = require('./basics');

import type { Event, Stream } from './basics';

function concatStream<T>(stream: Stream<T>) {
  // $FlowFixMe
  const concatEventToStream: (Event<T>) => Promise<boolean> | boolean = concatEvent(stream);
  // $FlowFixMe
  return (event: Event<Stream<T>>): Promise<boolean> | boolean => {
    //console.log(`concatStream(${stream.toString()}, ${strFromEvent(event)})`);
    if (event.done) {
      return concatEventToStream({ done: true });
    }
    else if (event.error) {
      return concatEventToStream({ error: event.error });
    }
    else {
      const substream = event.value;
      // Wait for the full substream to be consumed.
      let substreamDone = false;
      return substream.consume((substreamEvent: Event<T>) => {
        if (substreamEvent.done) {
          return true;
        }
        if (substreamEvent.error) {
          substreamDone = true;
        }
        return concatEventToStream(substreamEvent);
      })
        .then(() => substreamDone);
    }
  };
}

function concat<T>(...substreams: Stream<T>[]): Stream<T> {
  if (substreams.length == 0) {
    throw new StreamError('\'concat\' needs to be provided with at least one stream.');
  }
  if (substreams.length == 1) {
    return substreams[0];
  }
  return transduceToStream(undefined, concatStream)(fromIterable(substreams));
}

module.exports = {
  concat,
  concatStream
};
