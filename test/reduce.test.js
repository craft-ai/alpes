const test = require('ava');
const { delay } = require('../src/utils');
const { of, reduce, throwError } = require('../src');

test('Reduce function is applied to all the value in the stream', (t) => {
  return of(0, 1, 2, 3)
    .thru(reduce((acc, v) => acc + v + 1, 0))
    .then((result) => t.is(result, 10));
});

test('The default value for the accumulator is falsy', (t) => {
  return of(1, 2, 3)
    .thru(reduce((acc, v) => (acc ? acc + v : v)))
    .then((result) => t.is(result, 6));
});

test('The reduce function can retrieve a promise', (t) => {
  return of(1, 2, 3)
    .thru(reduce((acc, v) => delay(10).then(() => acc + v), 0))
    .then((result) => t.is(result, 6));
});

test('The reduce function is not called on errors', (t) => {
  return t
    .throws(
      throwError(new Error('a bad error')).thru(
        reduce(() => t.fail('should not be called'), 0)
      ),
      Error
    )
    .then((error) => {
      t.is(error.message, 'a bad error');
    });
});

test('The reduce function can throw', (t) => {
  return t
    .throws(
      of(1, 2, 3).thru(
        reduce((acc, v) => {
          if (v == 2) {
            throw new Error('owww');
          }
          return acc + v;
        }, 0)
      ),
      Error
    )
    .then((error) => {
      t.is(error.message, 'owww');
    });
});
