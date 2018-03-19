// @flow
import test from 'ava';
import { chain, drain, from, of, produce, subscribe, tap } from '../src';
import { delay } from '../src/utils';

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
    .thru(chain((v) => {
      t.is(v, iFrom);
      ++iFrom;
      return of(v + 1);
    }))
    .thru(subscribe((event) => {
      if (event.value) {
        t.is(event.value, iTransformed + 1);
        ++iTransformed;
      }
    }));
});

test('Chained function can change the type', (t) => {
  let iFrom = 0;
  let iTransformed = 0;
  t.plan(6);
  return of(0, 1, 2)
    .thru(chain((v) => {
      t.is(v, iFrom);
      ++iFrom;
      return of(`${v}`);
    }))
    .thru(subscribe((event) => {
      if (event.value) {
        t.is(event.value, `${iTransformed}`);
        ++iTransformed;
      }
    }));
});

test('Chained function can throw called on errors', (t) => {
  return t.throws(
    of('foo', 'bar', 'baz')
      .thru(chain((v) => {
        throw new Error(`this is an error on ${v}`);
      }))
      .thru(drain()),
    Error)
    .then((error) => t.is(error.message, 'this is an error on foo'));
});

test('Chain can reorder a stream', (t) => {
  const observedArray = [];
  return of(200, 100, 50, 150)
    .thru(chain((v) => from(delay(v).then(() => v))))
    .thru(tap((v) => observedArray.push(v)))
    .thru(drain())
    .then(() => {
      t.deepEqual(observedArray, [50, 100, 150, 200]);
    });
});

test('Chain can reorder a stream (2)', (t) => {
  const observedArray = [];
  return of(60, 100, 140)
    .thru(chain((v) => produce((push) => {
      return delay(v)
        .then(() => push({ value: v }))
        .then(() => delay(v))
        .then(() => push({ value: v }))
        .then(() => delay(v))
        .then(() => push({ value: v }))
        .then(() => delay(v))
        .then(() => push({ done: true }));
    })))
    .thru(tap((v) => observedArray.push(v)))
    .thru(drain())
    .then(() => {
      t.deepEqual(observedArray, [60, 100, 60, 140, 60, 100, 140, 100, 140]);
    });
});
