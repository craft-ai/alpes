const test = require('ava');
const {
  AlreadyConsumedStreamError,
  drain,
  of,
  StreamError,
  tap,
  throwError
} = require('../src');

test('Unable to drain a single stream twice', (t) => {
  const stream = of(0, 1, 2);
  const drainedStream1 = drain()(stream);
  t.truthy(drainedStream1);
  t.throws(() => drain()(stream), AlreadyConsumedStreamError);
});

test('Unable to drain and tap the same stream', (t) => {
  const stream = of(0, 1, 2);
  const drainedStream1 = drain()(stream);
  t.truthy(drainedStream1);
  t.throws(() => tap(() => undefined)(stream), StreamError);
});

test('Is rejected when the stream throws an error', (t) => {
  const ERROR_MESSAGE = 'This is a test error message';
  return t.throwsAsync(
    throwError(new Error(ERROR_MESSAGE)).thru(drain()),
    ERROR_MESSAGE
  );
});
