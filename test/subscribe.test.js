// @flow
import test from 'ava';
import { delay } from '../src/utils';
import { produce, subscribe } from '../src';

test('Handles the backpressure', (t) => {
  let value = 1;
  let expectedValue = 1;
  const LIMIT = 100;
  let done = false;
  return produce((push) => {
    // console.log(`${value} ->`);
    push({ value: value++ });
    if (value > LIMIT) {
      push({ done: true });
    }
  })
    .thru(subscribe((event) => {
      if (event.value) {
        // console.log(`-> ${event.value}`);
        t.is(event.value, expectedValue);
        ++expectedValue;
        return delay(100);
      }
      else if (event.done) {
        done = true;
      }
    }))
    .then(() => t.true(done));
});

test('Handles the backpressure (2)', (t) => {
  let value = 1;
  let expectedValue = 1;
  const LIMIT = 100;
  let done = false;
  return produce((push) => {
    let stop = false;
    while (!stop) {
      // console.log(`${value} ->`);
      stop = !push({ value: value++ });
      if (value > LIMIT) {
        push({ done: true });
        return;
      }
    }
  })
    .thru(subscribe((event) => {
      if (event.value) {
        // console.log(`-> ${event.value}`);
        t.is(event.value, expectedValue);
        ++expectedValue;
        return delay(100);
      }
      else if (event.done) {
        done = true;
      }
    }))
    .then(() => t.true(done));
});
