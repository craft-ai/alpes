const test = require('ava');
const { delay, from, of, produce } = require('../src');

test('Chained function is applied to all the value in the stream', (t) => {
  let iFrom = 0;
  let iTransformed = 0;
  const size = 2000;
  let data = new Array(size);
  for (let i = 0; i < data.length; ++i) {
    data[i] = i;
  }
  t.plan(size * 2);
  return from(data)
    .chain((v) => {
      t.is(v, iFrom);
      ++iFrom;
      return of(v + 1);
    })
    .subscribe((event) => {
      if (event.value) {
        t.is(event.value, iTransformed + 1);
        ++iTransformed;
      }
    });
});

test('Chained function can change the type', (t) => {
  let iFrom = 0;
  let iTransformed = 0;
  t.plan(6);
  return of(0, 1, 2)
    .chain((v) => {
      t.is(v, iFrom);
      ++iFrom;
      return of(`${v}`);
    })
    .subscribe((event) => {
      if (event.value) {
        t.is(event.value, `${iTransformed}`);
        ++iTransformed;
      }
    });
});

test('Chained function can throw called on errors', (t) => {
  return t
    .throwsAsync(
      of('foo', 'bar', 'baz')
        .chain((v) => {
          throw new Error(`this is an error on ${v}`);
        })
        .drain(),
      Error
    )
    .then((error) => t.is(error.message, 'this is an error on foo'));
});

test('Chain can reorder a stream', (t) => {
  const observedArray = [];
  return of(200, 100, 50, 150)
    .chain((v) => from(delay(v).then(() => v)))
    .tap((v) => observedArray.push(v))
    .drain()
    .then(() => {
      t.deepEqual(observedArray, [50, 100, 150, 200]);
    });
});

test('Chain can reorder a stream (2)', (t) => {
  const observedArray = [];
  return of(100, 150)
    .chain((v) =>
      produce((push) => {
        return delay(v)
          .then(() => push({ value: v }))
          .then(() => delay(v))
          .then(() => push({ value: v }))
          .then(() => delay(v))
          .then(() => push({ done: true }));
      })
    )
    .tap((v) => observedArray.push(v))
    .drain()
    .then(() => {
      t.deepEqual(observedArray, [100, 150, 100, 150]);
    });
});

test('Works on delayed producers', (t) => {
  return of(1, 2, 3, 4)
    .chain((v) => from(delay(10).then(() => v)))
    .chain((v) => of(v))
    .collect()
    .then((a) => {
      t.deepEqual(a, [1, 2, 3, 4]);
    });
});

test('Works in a nested way', (t) => {
  return of(1, 2, 3)
    .chain((v1) =>
      of(1, 2, 3).chain((v2) => from(delay(10).then(() => v1 * 10 + v2)))
    )
    .collect()
    .then((array) => {
      t.deepEqual(array.sort(), [11, 12, 13, 21, 22, 23, 31, 32, 33]);
    });
});

test('Handles errors properly', (t) => {
  return t
    .throwsAsync(
      of(1, 2, 3)
        .chain((v) =>
          from(
            delay(v * 10).then(() => {
              if (v % 2 != 0) {
                throw new Error('Odd values are bad');
              }
              return `${v}${v}`;
            })
          )
        )
        .drain(),
      Error
    )
    .then((error) => t.is(error.message, 'Odd values are bad'));
});
