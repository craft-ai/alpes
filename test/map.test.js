// @flow
import test from 'ava';
import { drain, map, of, tap, throwError } from '../src';

test('Mapped function is applied to all the value in the stream', (t) => {
  let iFrom = 0;
  let iTransformed = 0;
  t.plan(6);
  return of(0, 1, 2)
    .thru(map((v) => {
      t.is(v, iFrom);
      ++iFrom;
      return v + 1;
    }))
    .thru(tap((v) => {
      t.is(v, iTransformed + 1);
      ++iTransformed;
    }))
    .thru(drain());
});

test('Mapped function can change the type', (t) => {
  let iFrom = 0;
  let iTransformed = 0;
  t.plan(6);
  return of(0, 1, 2)
    .thru(map((v) => {
      t.is(v, iFrom);
      ++iFrom;
      return `${v}`;
    }))
    .thru(tap((v) => {
      t.is(v, `${iTransformed}`);
      ++iTransformed;
    }))
    .thru(drain());
});

test('Mapped function not called on errors', (t) => {
  t.plan(1);
  return t.throws(
    throwError(new Error('this is an error'))
      .thru(map((v) => {
        t.fail('Unexpected event in the stream');
      }))
      .thru(drain())
  );
});

test('Mapped function can throw called on errors', (t) => {
  return t.throws(
    of('foo', 'bar', 'baz')
      .thru(map((v) => {
        throw new Error(`this is an error on ${v}`);
      }))
      .thru(drain()),
    Error)
    .then((error) => t.is(error.message, 'this is an error on foo'));
});

test('Unable to map a single stream twice', (t) => {
  const stream = of(0, 1, 2);
  const mappedStream1 = map((v) => v * 2)(stream);
  t.truthy(mappedStream1);
  t.throws(() => map((v) => v / 2)(stream), Error);
});
