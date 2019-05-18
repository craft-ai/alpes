const { strFromEvent } = require('./basics');

class StreamError extends Error {
  constructor(message, stream) {
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

class ProduceEventOnceDoneStreamError extends StreamError {
  constructor(event, stream) {
    super(
      `Can't produce event ${strFromEvent(
        event
      )}, no event should be produced once the stream is done.`,
      stream
    );
  }
}

class AlreadyConsumedStreamError extends StreamError {
  constructor(stream) {
    super('Stream already being consumed.', stream);
  }
}

module.exports = {
  AlreadyConsumedStreamError,
  ProduceEventOnceDoneStreamError,
  StreamError
};
