//@flow
const { Readable } = require('stream');
const { StreamError } = require('./errors');
const { createBaseStream } = require('./baseStream');

import type { Push, Stream } from './basics';
import type stream from 'stream';

function fromReadable<T>(readable: stream.Readable): Stream<T> {
  const stream = createBaseStream();
  const removeListeners = () => {
    readable
      .removeListener('data', dataListener)
      .removeListener('error', errorListener)
      .removeListener('end', endListener);
  };
  const dataListener = (value) => {
    const ready = stream.push({ value });
    if (ready instanceof Promise) {
      readable.pause();
      ready.then((ready) => {
        if (ready) {
          readable.resume();
        }
        else {
          // The only way it's not ready for more is that the consumer is done.
          removeListeners();
        }
      });
    }
    else if (!ready) {
      // The only way it's not ready for more is that the consumer is done.
      removeListeners();
    }
  };
  const errorListener = (error) => {
    stream.push({ error });
    removeListeners();
  };
  const endListener = () => {
    stream.push({ done: true });
    removeListeners();
  };
  readable
    .on('data', dataListener)
    .on('error', errorListener)
    .on('end', endListener)
    .resume();

  return stream;
}

function fromIterable<T>(iterable: Iterable<T>): Stream<T> {
  // $FlowFixMe bug in the Iterable type of flow (cf. https://github.com/facebook/flow/issues/1163)
  const iterator: Iterator<T> = iterable[Symbol.iterator]();
  return createBaseStream(
    (push: Push<T>) => {
      let continueProduction = true;
      while (continueProduction) {
        const iteratorResult = iterator.next();
        if (iteratorResult.done) {
          push({ done: true });
          continueProduction = false;
        }
        else {
          continueProduction = push({ value: iteratorResult.value });
        }
      }
    }
  );
}

function fromError<T>(error: Error): Stream<T> {
  return createBaseStream((push) => { push({ error }); });
}

function fromPromise<T>(promise: Promise<T>): Stream<T> {
  return createBaseStream((push) => promise.then(
    (value) => {
      push({ value });
      push({ done: true });
    },
    (error) => {
      push({ error });
    }
  ));
}

function from<T>(input: Iterable<T> | stream.Readable | Error | Promise<T>): Stream<T> {
  if (input instanceof Readable) {
    return fromReadable(input);
  }
  else if (input instanceof Error) {
    return fromError(input);
  }
  else if (input instanceof Promise) {
    return fromPromise(input);
  }
  // $FlowFixMe bug in the Iterable type of flow (cf. https://github.com/facebook/flow/issues/1163)
  else if (input && typeof input[Symbol.iterator] === 'function') {
    return fromIterable(input);
  }
  else {
    return fromError(new StreamError('Unable to create a stream, \'from\' only supports iterable, Readable stream or Error.'));
  }
}

function of<T>(...args: T[]): Stream<T> {
  return fromIterable(args);
}

module.exports = {
  from,
  fromIterable,
  of,
  throwError: fromError,
};
