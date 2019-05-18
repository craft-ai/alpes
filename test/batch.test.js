const test = require('ava');
const { batch, collect, from, of } = require('../src');

test('Batch emits arrays of the given size from a stream', (t) => {
  return of(0, 1, 2, 3, 4, 5)
    .thru(batch(3))
    .thru(collect())
    .then((result) => t.deepEqual(result, [[0, 1, 2], [3, 4, 5]]));
});

test('Batch emits arrays of at most the given size from a stream', (t) => {
  return of(0, 1, 2, 3, 4, 5)
    .thru(batch(4))
    .thru(collect())
    .then((result) => t.deepEqual(result, [[0, 1, 2, 3], [4, 5]]));
});

test('Batch is resilient to null count', (t) => {
  return of('a', 'b', 'c')
    .thru(batch(0))
    .thru(collect())
    .then((result) => t.deepEqual(result, [['a'], ['b'], ['c']]));
});

test('Batch is resilient to negative count', (t) => {
  return of('a', 'b', 'c')
    .thru(batch(-3))
    .thru(collect())
    .then((result) => t.deepEqual(result, [['a'], ['b'], ['c']]));
});

test('Batch handles errors properly', (t) => {
  return t.throwsAsync(
    from(new Error('An error'))
      .thru(batch(3))
      .thru(collect())
  );
});
