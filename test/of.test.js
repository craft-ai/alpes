// @flow
import test from 'ava';
import { drain, of, tap, transform } from '../src';

test('Streams the given values', (t) => {
  const observedArray = [];
  return of(1, 2, 3)
    .thru(tap((v) => observedArray.push(v)))
    .thru(drain())
    .then(() => t.deepEqual(observedArray, [1, 2, 3]));
});

test('Can be consumed', (t) => {
  let str = '';
  t.plan(1);
  return of(1, 2, 3)
    .thru(transform((event, push, next) => {
      if (event.error) {
        t.fail(`Unexpected error '${event.error.toString()}'.`);
      }
      else if (event.done) {
        push({ value: str });
        push({ done: true });
      }
      else {
        str = str.concat(`${event.value}`);
      }
    }))
    .thru(tap((v) => t.deepEqual(v, '123')))
    .thru(drain());
});
