// @flow
import test from 'ava';
import { collect, from, of, skip } from '../src';

test('Can skip some values of a stream', (t) => {
  return of(0, 1, 2)
    .thru(skip(2))
    .thru(collect())
    .then((result) => t.deepEqual(result, [2]));
});

test('Can skip all values from a stream', (t) => {
  return of(0, 1, 2)
    .thru(skip(16))
    .thru(collect())
    .then((result) => t.deepEqual(result, []));
});

test('Can skip no values from a stream', (t) => {
  return of(0, 1, 2)
    .thru(skip(0))
    .thru(collect())
    .then((result) => t.deepEqual(result, [0, 1, 2]));
});

test('Is resilient to negative count', (t) => {
  return of(0, 1, 2)
    .thru(skip(-3))
    .thru(collect())
    .then((result) => t.deepEqual(result, [0, 1, 2]));
});

test('Handles errors properly', (t) => {
  return t.throws(
    from(new Error('An error'))
      .thru(skip(1))
      .thru(collect()));
});
