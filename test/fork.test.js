// @flow
import test from 'ava';
import { AlreadyConsumedStreamError, chain, collect, concatMap, fork, from, produce, take } from '../src';
import { delay } from '../src/utils';

test('It is possible to fork a simple stream', (t) => {
  const stream = from([1, 2, 3, 4, 5]);
  const forks = fork(4)(stream);

  return Promise.all(
    forks
      .map((fork) => collect()(fork)
        .then((collected) => t.deepEqual(collected, [1, 2, 3, 4, 5])))
  );
});

test('Forked stream can be asynchronously treated', (t) => {
  const stream = from([1, 2, 3, 4, 5]);
  const forks = fork(4)(stream);
  const delayEvents = concatMap((v) => from(delay(50).then(() => v)));

  return Promise.all(
    forks
      .map((fork) => collect()(delayEvents(fork))
        .then((collected) => t.deepEqual(collected, [1, 2, 3, 4, 5])))
  );
});

test('Infinite stream can be forked', (t) => {
  const stream = produce((push, value) => {
    value += 1;
    push({ value });
    return value;
  }, -1);
  const [fork1, fork2] = fork(2)(stream);

  return Promise.all([
    fork1
      .thru(take(5))
      .thru(collect())
      .then((a) => t.deepEqual(a, [0, 1, 2, 3, 4])),
    fork2
      .thru(take(7))
      .thru(collect())
      .then((a) => t.deepEqual(a, [0, 1, 2, 3, 4, 5, 6]))
  ]);
});

test('Infinite stream can be forked (2)', (t) => {
  const stream = produce((push, value) => {
    value += 1;
    push({ value });
    return value;
  }, -1);
  const [fork1, fork2] = fork(2)(stream);

  return Promise.all([
    fork1
      .thru(take(250))
      .thru(collect())
      .then((a) => t.is(a.length, 250)),
    fork2
      .thru(take(50))
      .thru(collect())
      .then((a) => t.is(a.length, 50))
  ]);
});

test('Stream with errors can be forked', (t) => {
  const ERROR_MSG = 'this is an error message.';
  const stream = produce((push, value) => {
    value += 1;
    if (value < 100) {
      return delay(5).then(() => {
        push({ value });
        return value;
      });
    }
    else {
      throw (new Error(ERROR_MSG));
    }
  }, -1);
  const forks = fork(3)(stream);

  return Promise.all(forks.map((fork) =>
    t.throws(collect()(fork), Error)
      .then((error) => t.is(error.message, ERROR_MSG))
  ));
});

test('Unable to fork a stream already being consumer', (t) => {
  const stream = from([1, 2, 3, 4, 5]);
  collect()(stream);
  return t.throws(() => fork(5)(stream), AlreadyConsumedStreamError);
});

test('Fork and chain play well together', (t) => {
  const stream = produce((push, value) => {
    if (value == null) {
      throw new Error('aaaaaah');
    }
    value -= 1;
    push({ value });
    if (value <= 0) {
      push({ done: true });
    }
    return delay(5).then(() => value);
  }, 400);
  return from(fork(200)(stream))
    .thru(chain((f) => from(collect()(f))))
    .thru(collect())
    .then((r) => {
      t.is(r.length, 200);
      t.deepEqual(r[123].length, 400);
    });
});
