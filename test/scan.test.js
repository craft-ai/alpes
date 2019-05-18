const test = require('ava');
const { collect, of, scan, throwError } = require('../src');
const { delay } = require('../src/utils');

test('The scanner is applied to all the value in the stream', (t) => {
  return of(0, 1, 2, 3)
    .thru(scan((acc, v) => acc + v + 1, 0))
    .thru(collect())
    .then((result) => t.deepEqual(result, [1, 3, 6, 10]));
});

test('The default value for the accumulator is falsy', (t) => {
  return of(1, 2, 3)
    .thru(scan((acc, v) => (acc ? acc + v : v)))
    .thru(collect())
    .then((result) => t.deepEqual(result, [1, 3, 6]));
});

test('The scanner can return a promise', (t) => {
  return of(1, 2, 3)
    .thru(scan((acc, v) => delay(10).then(() => acc + v), 0))
    .thru(collect())
    .then((result) => t.deepEqual(result, [1, 3, 6]));
});

test('The scanner is not called on errors', (t) => {
  return t
    .throws(
      throwError(new Error('a bad error'))
        .thru(scan(() => t.fail('should not be called'), 0))
        .thru(collect()),
      Error
    )
    .then((error) => {
      t.is(error.message, 'a bad error');
    });
});

test('The scanner can throw', (t) => {
  return t
    .throws(
      of(1, 2, 3)
        .thru(
          scan((acc, v) => {
            if (v == 2) {
              throw new Error('owww');
            }
            return acc + v;
          }, 0)
        )
        .thru(collect()),
      Error
    )
    .then((error) => {
      t.is(error.message, 'owww');
    });
});
