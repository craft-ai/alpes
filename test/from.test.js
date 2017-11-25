// @flow
import fs from 'fs';
import path from 'path';
import test from 'ava';
import { drain, from, StreamError, tap } from '../src';

test('Can be provided with an array', (t) => {
  const observed = [];
  return from([1, 2, 3])
    .thru(tap((v) => observed.push(v)))
    .thru(drain())
    .then(() => t.deepEqual(observed, [1, 2, 3]));
});

test('Can be provided with a string', (t) => {
  const observed = [];
  return from('foo')
    .thru(tap((v) => observed.push(v)))
    .thru(drain())
    .then(() => t.deepEqual(observed, ['f', 'o', 'o']));
});

test('Can be provided with a Map', (t) => {
  let myMap = new Map();
  myMap.set('a', 1);
  myMap.set('b', 2);
  myMap.set('c', 3);

  const observed = [];
  return from(myMap)
    .thru(tap((v) => observed.push(v)))
    .thru(drain())
    .then(() => t.deepEqual(observed, [['a', 1], ['b', 2], ['c', 3]]));
});

test('Can be provided with a Readable', (t) => {
  const myReadable = fs.createReadStream(
    path.resolve(__dirname, './data/letranger-incipit.txt'),
    { encoding: 'utf-8' }
  );

  return from(myReadable)
    .thru(tap((v) => t.snapshot(v)))
    .thru(drain());
});

test('Can be provided with a bad Readable', (t) => {
  const myReadable = fs.createReadStream(
    path.resolve(__dirname, 'not-an-existing-file.txt'),
    { encoding: 'utf-8' }
  );

  return t.throws(from(myReadable).thru(drain()), Error);
});

test('Fails when no argument is provided', (t) => {
  return t.throws(
    // $FlowFixMe check error when flow doesn't yell
    from().thru(drain()),
    StreamError)
    .then((error) => t.is(error.message, 'Unable to create a stream, \'from\' only supports iterable or Readable stream.'));
});
