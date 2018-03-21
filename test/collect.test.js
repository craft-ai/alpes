// @flow
import test from 'ava';
import { collect, from, of } from '../src';

test('Collect the values from a stream', (t) => {
  return of(0, 1, 2)
    .thru(collect())
    .then((result) => t.deepEqual(result, [0, 1, 2]));
});

test('Empty stream is collected as an empty array', (t) => {
  return from([])
    .thru(collect())
    .then((result) => t.deepEqual(result, []));
});

test('Is rejected when the stream throws an error', (t) => {
  const ERROR_MESSAGE = 'This is a test error message';
  return t.throws(
    from(new Error(ERROR_MESSAGE)).thru(collect()),
    ERROR_MESSAGE
  );
});
