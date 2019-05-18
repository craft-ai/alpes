const test = require('ava');
const { delay } = require('../src/utils');
const { drain, of, tap, throwError, transform } = require('../src');

test('Can map each values of a stream', (t) => {
  const observed = [];
  return of(1, 2, 3, 4)
    .thru(
      transform((event, push) => {
        if (event.value) {
          push({ value: event.value % 2 });
        } else {
          push(event);
        }
      })
    )
    .thru(tap((v) => observed.push(v)))
    .thru(drain())
    .then(() => t.deepEqual(observed, [1, 0, 1, 0]));
});

test('Can take a seed', (t) => {
  const observed = [];
  return of(1, 2, 3, 4)
    .thru(
      transform((event, push, seed) => {
        if (event.value) {
          push({ value: event.value % (seed || 1) });
          return event.value;
        }
        push(event);
        return 0;
      }, 1)
    )
    .thru(tap((v) => observed.push(v)))
    .thru(drain())
    .then(() => t.deepEqual(observed, [0, 0, 1, 1]));
});

test('Can be asynchronous', (t) => {
  const observed = [];
  return of(1, 2, 3, 4)
    .thru(
      transform((event, push) => {
        if (event.value) {
          const newValue = event.value % 2;
          return delay(20).then(() => {
            push({ value: newValue });
          });
        } else {
          push(event);
        }
      })
    )
    .thru(tap((v) => observed.push(v)))
    .thru(drain())
    .then(() => t.deepEqual(observed, [1, 0, 1, 0]));
});

test('Can filter the values of a stream', (t) => {
  const observed = [];
  return of(1, 2, 3, 4)
    .thru(
      transform((event, push) => {
        if (event.value) {
          if (event.value % 2 == 0) {
            push({ value: event.value });
          }
        } else {
          push(event);
        }
      })
    )
    .thru(tap((v) => observed.push(v)))
    .thru(drain())
    .then(() => t.deepEqual(observed, [2, 4]));
});

test('Can throw an error on any value', (t) => {
  const observed = [];
  return t
    .throwsAsync(
      of(1, 2, 3, 4)
        .thru(
          transform((event, push) => {
            if (event.value && event.value % 3 == 0) {
              push({ error: new Error('I do not like multiples of 3') });
            } else {
              push(event);
            }
          })
        )
        .thru(tap((v) => observed.push(v)))
        .thru(drain()),
      Error
    )
    .then((error) => {
      t.is(error.message, 'I do not like multiples of 3');
      t.deepEqual(observed, [1, 2]);
    });
});

test('Can throw an error whenever (throw)', (t) => {
  t.plan(1);
  return of(1, 2, 3, 4)
    .thru(
      transform(() => {
        throw new Error('I do not like anything');
      })
    )
    .thru(drain())
    .catch((error) => t.is(error.message, 'I do not like anything'));
});

test('Can throw an error whenever (reject)', (t) => {
  t.plan(1);
  return of(1, 2, 3, 4)
    .thru(transform(() => Promise.reject(new Error('I do not like anything'))))
    .thru(drain())
    .catch((error) => t.is(error.message, 'I do not like anything'));
});

test('Can throw an error when done', (t) => {
  const observed = [];
  return t
    .throwsAsync(
      of(1, 2, 3, 4)
        .thru(
          transform((event, push) => {
            if (event.done) {
              t.false(push({ error: new Error('It should never end') }));
            } else {
              t.true(push(event));
            }
          })
        )
        .thru(tap((v) => observed.push(v)))
        .thru(drain()),
      Error
    )
    .then((error) => {
      t.is(error.message, 'It should never end');
      t.deepEqual(observed, [1, 2, 3, 4]);
    });
});

test('Can stop on any value', (t) => {
  const observed = [];
  return of(1, 2, 3, 4)
    .thru(
      transform((event, push) => {
        if (event.value && event.value % 3 == 0) {
          push({ done: true });
        } else {
          push(event);
        }
      })
    )
    .thru(tap((v) => observed.push(v)))
    .thru(drain())
    .then(() => t.deepEqual(observed, [1, 2]));
});

test('Can produce more data than it consumes', (t) => {
  const observed = [];
  return of(1, 2, 3, 4)
    .thru(
      transform((event, push) => {
        if (event.value) {
          for (let value = 0; value <= event.value; value++) {
            push({ value });
          }
        } else {
          push(event);
        }
      })
    )
    .thru(tap((v) => observed.push(v)))
    .thru(drain())
    .then(() =>
      t.deepEqual(observed, [0, 1, 0, 1, 2, 0, 1, 2, 3, 0, 1, 2, 3, 4])
    );
});

test('Can ignore errors', (t) => {
  const observed = [];
  return throwError(new Error('aahahahaha'))
    .thru(
      transform((event, push) => {
        if (event.error) {
          push({ value: 'woops' });
          push({ done: true });
        } else {
          push(event);
        }
      })
    )
    .thru(tap((v) => observed.push(v)))
    .thru(drain())
    .then(() => t.deepEqual(observed, ['woops']));
});
