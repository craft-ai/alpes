class StreamError extends Error {
  constructor(message, data = {}) {

    // Calling parent constructor of base Error class.
    super(message);

    // Saving class name in the property of our custom error as a shortcut.
    this.name = this.constructor.name;

    // Capturing stack trace, excluding constructor call from it.
    Error.captureStackTrace(this, this.constructor);

    // Any attached data properties
    this.data = data;
  }
}

module.exports = {
  StreamError
};
