const test = require('ava');
const { collect, produce, take } = require('../src');
const { delay } = require('../src/utils');

test('Can take from an infinite stream', (t) => {
  return produce((push, seed) => {
    push({ value: seed });
    return seed + 1;
  }, 0)
    .thru(take(5))
    .thru(collect())
    .then((result) => t.deepEqual(result, [0, 1, 2, 3, 4]));
});

test('Can take from an infinite asynchronous stream', (t) => {
  return produce((push, seed) => {
    push({ value: seed });
    return delay(10).then(() => seed + 1);
  }, 0)
    .thru(take(5))
    .thru(collect())
    .then((result) => t.deepEqual(result, [0, 1, 2, 3, 4]));
});

test('Can take less events than what is in the stream', (t) => {
  return produce((push) => {
    push({ value: 'gimme' });
    push({ value: 'gimme' });
    push({ value: 'gimme' });
    push({ value: 'a man after midnight' });
    push({ done: true });
  })
    .thru(take(3))
    .thru(collect())
    .then((result) => t.deepEqual(result, ['gimme', 'gimme', 'gimme']));
});

test('Can take 0 event', (t) => {
  return produce((push) => {
    push({ value: 'gimme' });
    push({ value: 'gimme' });
    push({ value: 'gimme' });
    push({ value: 'a man after midnight' });
    push({ done: true });
  })
    .thru(take(0))
    .thru(collect())
    .then((result) => t.deepEqual(result, []));
});

test('Is resilient to a negative count', (t) => {
  return produce((push) => {
    push({ value: 'gimme' });
    push({ value: 'gimme' });
    push({ value: 'gimme' });
    push({ value: 'a man after midnight' });
    push({ done: true });
  })
    .thru(take(-2))
    .thru(collect())
    .then((result) => t.deepEqual(result, []));
});

test('Handles errors properly', (t) => {
  return t.throws(
    produce((push) => {
      push({ value: 'gimme' });
      push({ value: 'gimme' });
      push({ error: new Error('It is 2 am!') });
    })
      .thru(take(5))
      .thru(collect())
  );
});
