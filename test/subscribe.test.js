// @flow
import test from 'ava';
import { delay } from '../src/utils';
import { produce, subscribe, tap } from '../src';

test('Handles the backpressure', (t) => {
  let value = 1;
  let expectedValue = 1;
  const LIMIT = 100;
  let done = false;
  return produce((push, next) => {
    push({ value: value++ });
    if (value > LIMIT) {
      push({ done: true });
    }
  })
    .thru(subscribe((event) => {
      if (event.value) {
        t.is(event.value, expectedValue);
        ++expectedValue;
        return delay(50);
      }
      else if (event.done) {
        done = true;
      }
    }))
    .then(() => t.true(done));
});
