const test = require('ava');
const {
  concat,
  delay,
  drain,
  from,
  of,
  produce,
  StreamError,
  subscribe,
  tap
} = require('../src');

test('Concat throws an error when not provided with any stream', (t) => {
  return t.throws(() => concat(), StreamError);
});

test('Concat act as a passthrough when only one stream is provided', (t) => {
  let eventCounter = 0;
  return concat(of('un', 'dos', 'tres')).thru(
    subscribe((event) => {
      switch (eventCounter) {
        case 0:
          t.truthy(event.value);
          t.is(event.value, 'un');
          break;
        case 1:
          t.truthy(event.value);
          t.is(event.value, 'dos');
          break;
        case 2:
          t.truthy(event.value);
          t.is(event.value, 'tres');
          break;
        case 3:
          t.falsy(event.value);
          t.true(event.done);
          break;
        default:
          t.fail();
      }
      ++eventCounter;
    })
  );
});

test('Concat keeps the order of the streams', (t) => {
  let counter = 0;

  t.plan(7);
  return concat(
    of(1, 2, 3),
    produce((push) =>
      delay(100).then(() => {
        push({ value: 4 });
        push({ done: true });
      })
    ),
    of(5, 6, 7)
  )
    .thru(tap((value) => t.is(value, ++counter)))
    .thru(drain());
});

test('Concat stops on error', (t) => {
  let counter = 0;
  const errorMessage = 'fire in the hole!';

  t.plan(6);
  return t
    .throwsAsync(
      concat(of(1, 2, 3, 4), from(new Error('fire in the hole!')), of(5, 6, 7))
        .thru(tap((value) => t.is(value, ++counter)))
        .thru(drain()),
      Error
    )
    .then((error) => {
      t.is(error.message, errorMessage);
    });
});
