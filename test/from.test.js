const fs = require('fs');
const path = require('path');
const test = require('ava');
const { collect, drain, from, StreamError, tap } = require('../src');
const { delay } = require('../src/utils');

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

test('Can be provided with a Promise that will be fulfilled', (t) => {
  return from(delay(100).then(() => 'tada'))
    .thru(tap((value) => t.is(value, 'tada')))
    .thru(drain());
});

test('Can be provided with a Promise that will be rejected', (t) => {
  return t
    .throwsAsync(
      from(delay(100).then(() => Promise.reject(new Error('boouh')))).thru(
        drain()
      )
    )
    .then((error) => t.is(error.message, 'boouh'));
});

test('Can be provided with a Promise that will be fulfilled to null', (t) => {
  return from(delay(100).then(() => null))
    .thru(collect())
    .then((values) => t.deepEqual(values, [null]));
});

test('Can be provided with an Error', (t) => {
  return t
    .throwsAsync(from(new Error('blop')).thru(drain()))
    .then((error) => t.is(error.message, 'blop'));
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

  return t.throwsAsync(from(myReadable).thru(drain()), Error);
});

test('Fails when no argument is provided', (t) => {
  return t
    .throwsAsync(
      // $FlowFixMe check error when flow doesn't yell
      from().thru(drain()),
      StreamError
    )
    .then((error) =>
      t.is(
        error.message,
        "Unable to create a stream, 'from' only supports iterable, Readable stream or Error."
      )
    );
});
