// @flow
const { strFromEvent } = require('./basics');

import type { Event, Stream } from './basics';

class StreamError<T> extends Error {
  stream: string;
  constructor(message: string, stream: ?Stream<T>) {
    // Calling parent constructor of base Error class.
    super(message);

    // Saving class name in the property of our custom error as a shortcut.
    this.name = this.constructor.name;

    // Capturing stack trace, excluding constructor call from it.
    Error.captureStackTrace(this, this.constructor);

    // Attach the metadata from the stream
    if (stream) {
      this.stream = stream.toString();
    }
  }
}

class ProduceEventOnceDoneStreamError<T> extends StreamError<T> {
  constructor(event: Event<T>, stream: Stream<T>) {
    super(`Can't produce event ${strFromEvent(event)}, no event should be produced once the stream is done.`, stream);
  }
}

class AlreadyConsumedStreamError<T> extends StreamError<T> {
  constructor(stream: Stream<T>) {
    super('Stream already being consumed.', stream);
  }
}

module.exports = {
  AlreadyConsumedStreamError,
  ProduceEventOnceDoneStreamError,
  StreamError
};
