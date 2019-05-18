const test = require('ava');
const {
  collect,
  concatMap,
  drain,
  from,
  of,
  produce,
  subscribe,
  tap
} = require('../src');
const { delay } = require('../src/utils');

test('Mapped function is applied to all the value in the stream', (t) => {
  let iFrom = 0;
  let iTransformed = 0;
  const size = 2000;
  let data = new Array(size);
  for (let i = 0; i < data.length; ++i) {
    data[i] = i;
  }
  t.plan(size * 2);
  return from(data)
    .thru(
      concatMap((v) => {
        t.is(v, iFrom);
        ++iFrom;
        return of(v + 1);
      })
    )
    .thru(
      subscribe((event) => {
        if (event.value) {
          t.is(event.value, iTransformed + 1);
          ++iTransformed;
        }
      })
    );
});

test('Mapped function can change the type', (t) => {
  let iFrom = 0;
  let iTransformed = 0;
  t.plan(6);
  return of(0, 1, 2)
    .thru(
      concatMap((v) => {
        t.is(v, iFrom);
        ++iFrom;
        return of(`${v}`);
      })
    )
    .thru(
      subscribe((event) => {
        if (event.value) {
          t.is(event.value, `${iTransformed}`);
          ++iTransformed;
        }
      })
    );
});

test('Mapped function can throw called on errors', (t) => {
  return t
    .throwsAsync(
      of('foo', 'bar', 'baz')
        .thru(
          concatMap((v) => {
            throw new Error(`this is an error on ${v}`);
          })
        )
        .thru(drain()),
      Error
    )
    .then((error) => t.is(error.message, 'this is an error on foo'));
});

test('ConcatMap does not reorder a stream', (t) => {
  const observedArray = [];
  return of(20, 10, 5, 15)
    .thru(concatMap((v) => from(delay(v).then(() => v))))
    .thru(tap((v) => observedArray.push(v)))
    .thru(drain())
    .then(() => {
      t.deepEqual(observedArray, [20, 10, 5, 15]);
    });
});

test('ConcatMap does not reorder a stream (2)', (t) => {
  const observedArray = [];
  return of(6, 10, 14)
    .thru(
      concatMap((v) =>
        produce((push) => {
          return delay(v)
            .then(() => push({ value: v }))
            .then(() => delay(v))
            .then(() => push({ value: v }))
            .then(() => delay(v))
            .then(() => push({ value: v }))
            .then(() => delay(v))
            .then(() => push({ done: true }));
        })
      )
    )
    .thru(tap((v) => observedArray.push(v)))
    .thru(drain())
    .then(() => {
      t.deepEqual(observedArray, [6, 6, 6, 10, 10, 10, 14, 14, 14]);
    });
});

test('Works in a nested way', (t) => {
  return of(1, 2, 3)
    .thru(
      concatMap((v1) =>
        of(1, 2, 3).thru(
          concatMap((v2) => from(delay(10).then(() => v1 * 10 + v2)))
        )
      )
    )
    .thru(collect())
    .then((array) => {
      t.deepEqual(array, [11, 12, 13, 21, 22, 23, 31, 32, 33]);
    });
});
