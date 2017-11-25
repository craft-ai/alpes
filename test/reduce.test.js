// @flow
import test from 'ava';
import { delay } from '../src/utils';
import { of, reduce } from '../src';

test('Reduce function is applied to all the value in the stream', (t) => {
  return of(0, 1, 2, 3)
    .thru(reduce((acc, v) => acc + v + 1, 0))
    .then((result) => t.is(result, 10));
});

test('The default value for the accumulator is falsy', (t) => {
  return of(1, 2, 3)
    .thru(reduce((acc, v) => acc ? acc + v : v))
    .then((result) => t.is(result, 6));
});

test('The reduce function can retrieve a promise', (t) => {
  return of(1, 2, 3)
    .thru(reduce((acc, v) => delay(10).then(() => acc + v), 0))
    .then((result) => t.is(result, 6));
});
