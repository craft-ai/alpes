const test = require('ava');
const { from, of } = require('../src');

test('Batch emits arrays of the given size from a stream', (t) => {
  return of(0, 1, 2, 3, 4, 5)
    .batch(3)
    .collect()
    .then((result) => t.deepEqual(result, [[0, 1, 2], [3, 4, 5]]));
});

test('Batch emits arrays of at most the given size from a stream', (t) => {
  return of(0, 1, 2, 3, 4, 5)
    .batch(4)
    .collect()
    .then((result) => t.deepEqual(result, [[0, 1, 2, 3], [4, 5]]));
});

test('Batch is resilient to null count', (t) => {
  return of('a', 'b', 'c')
    .batch(0)
    .collect()
    .then((result) => t.deepEqual(result, [['a'], ['b'], ['c']]));
});

test('Batch is resilient to negative count', (t) => {
  return of('a', 'b', 'c')
    .batch(-3)
    .collect()
    .then((result) => t.deepEqual(result, [['a'], ['b'], ['c']]));
});

test('Batch handles errors properly', (t) => {
  return t.throwsAsync(
    from(new Error('An error'))
      .batch(3)
      .collect()
  );
});
