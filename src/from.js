const { Readable } = require('stream');
const { StreamError } = require('./errors');
const { createBaseStream } = require('./baseStream');

function fromEventEmitter(eventEmitter, listeners) {
  const stream = createBaseStream();
  const encapsulatedPush = (event) => {
    const pushResult = stream.push(event);
    if (pushResult instanceof Promise) {
      return pushResult.then((done) => {
        if (done) {
          removeListeners();
        }
        return done;
      });
    } else if (pushResult) {
      removeListeners();
      return true;
    }
    return false;
  };

  const encapsulatedListeners = Object.keys(listeners).map((event) => ({
    event,
    listener: listeners[event](encapsulatedPush)
  }));

  const removeListeners = () => {
    encapsulatedListeners.forEach(({ event, listener }) => {
      eventEmitter.removeListener(event, listener);
    });
  };

  encapsulatedListeners.forEach(({ event, listener }) => {
    eventEmitter.on(event, listener);
  });

  return stream;
}

function fromReadable(readable) {
  // $FlowFixMe stream.Readable does not extend events.EventEmitter in the type system
  const eventEmitter = readable;
  const stream = fromEventEmitter(eventEmitter, {
    data: (push) => (value) => {
      const pushResult = push({ value });
      if (pushResult instanceof Promise) {
        readable.pause();
        pushResult.then((done) => {
          if (!done) {
            readable.resume();
          }
        });
      }
    },
    error: (push) => (error) => push({ error }),
    end: (push) => () => push({ done: true })
  });

  readable.resume();

  return stream;
}

function fromIterable(iterable) {
  // $FlowFixMe bug in the Iterable type of flow (cf. https://github.com/facebook/flow/issues/1163)
  const iterator = iterable[Symbol.iterator]();
  return createBaseStream((push) => {
    let continueProduction = true;
    while (continueProduction) {
      const iteratorResult = iterator.next();
      if (iteratorResult.done) {
        push({ done: true });
        continueProduction = false;
      } else {
        continueProduction = push({ value: iteratorResult.value });
      }
    }
  });
}

function fromError(error) {
  return createBaseStream((push) => {
    push({ error });
  });
}

function fromPromise(promise) {
  return createBaseStream((push) =>
    promise.then(
      (value) => {
        push({ value });
        push({ done: true });
      },
      (error) => {
        push({ error });
      }
    )
  );
}

function from(input) {
  if (input instanceof Readable) {
    return fromReadable(input);
  } else if (input instanceof Error) {
    return fromError(input);
  } else if (input instanceof Promise) {
    return fromPromise(input);
  }
  // $FlowFixMe bug in the Iterable type of flow (cf. https://github.com/facebook/flow/issues/1163)
  else if (input && typeof input[Symbol.iterator] === 'function') {
    return fromIterable(input);
  } else {
    return fromError(
      new StreamError(
        "Unable to create a stream, 'from' only supports iterable, Readable stream or Error."
      )
    );
  }
}

function of(...args) {
  return fromIterable(args);
}

module.exports = {
  from,
  fromEventEmitter,
  fromIterable,
  of,
  throwError: fromError
};
