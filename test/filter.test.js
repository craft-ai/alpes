const test = require('ava');
const { collect, filter, from, of } = require('../src');

test('Can filter even values of a stream', (t) => {
  return of(0, 1, 2, 3, 4)
    .thru(filter((v) => v % 2 == 0))
    .thru(collect())
    .then((result) => t.deepEqual(result, [0, 2, 4]));
});

test('Can filter all values from a stream', (t) => {
  return of(0, 1, 2, 3, 4)
    .thru(filter((v) => v == undefined))
    .thru(collect())
    .then((result) => t.deepEqual(result, []));
});

test('Can filter no values from a stream', (t) => {
  return of(0, 1, 2, 3, 4)
    .thru(filter((v) => v >= 0))
    .thru(collect())
    .then((result) => t.deepEqual(result, [0, 1, 2, 3, 4]));
});

test('Handles errors in the stream roperly', (t) => {
  return t.throws(
    from(new Error('An error'))
      .thru(filter((v) => v >= 0))
      .thru(collect())
  );
});

test('Handles errors throw in the filter properly', (t) => {
  return t.throws(
    from(['so cool'])
      .thru(
        filter(() => {
          throw new Error('An error');
        })
      )
      .thru(collect())
  );
});
