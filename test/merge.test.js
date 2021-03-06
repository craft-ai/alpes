const test = require('ava');
const {
  collect,
  delay,
  drain,
  merge,
  of,
  produce,
  StreamError,
  subscribe,
  tap
} = require('../src');

test('Merge throws an error when not provided with any stream', (t) => {
  return t.throws(() => merge(), StreamError);
});

test('Merge act as a passthrough when only one stream is provided', (t) => {
  let eventCounter = 0;
  return merge(of('un', 'dos', 'tres')).thru(
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

const ALPHABET = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z'
];

const COLORS = [
  'Red',
  'Orange',
  'Yellow',
  'Green',
  'Cyan',
  'Blue',
  'Indigo',
  'Violet',
  'Purple',
  'Magenta',
  'Pink',
  'Brown',
  'White',
  'Gray',
  'Black'
];

function createStream(sourceArray, delayTime = 0) {
  let index = 0;
  if (delayTime > 0) {
    return produce((push) =>
      delay(delayTime).then(() => {
        push({ value: sourceArray[index] });
        index++;
        if (index >= sourceArray.length) {
          push({ done: true });
        }
      })
    );
  } else {
    return produce((push) => {
      push({ value: sourceArray[index] });
      index++;
      if (index >= sourceArray.length) {
        push({ done: true });
      }
    });
  }
}

test('Merge two slow streams', (t) => {
  const alpha = createStream(ALPHABET, 50);
  const colors = createStream(COLORS, 100);

  t.plan(ALPHABET.length + COLORS.length);
  return merge(alpha, colors)
    .thru(tap((value) => t.truthy(value)))
    .thru(drain());
});

test('Merge two fast streams', (t) => {
  const alpha = createStream(ALPHABET);
  const colors = createStream(COLORS);

  t.plan(ALPHABET.length + COLORS.length);
  return merge(alpha, colors)
    .thru(tap((value) => t.truthy(value)))
    .thru(drain());
});

test('Works on merged streams producers', (t) => {
  const stream1 = createStream([1, 2, 3], 10);
  const stream2 = createStream([4, 5, 6], 10);
  const stream3 = createStream([7, 8, 9], 10);
  const stream4 = createStream([10, 11, 12], 10);
  return merge(merge(merge(stream1, stream2), stream3), stream4)
    .thru(collect())
    .then((array) => {
      t.is(array.length, 12);
    });
});

test('Error on one side triggers an error on the merge', (t) => {
  const alpha = createStream(ALPHABET, 200);
  const colors = createStream(COLORS, 300);
  const errorMessage = 'saperlipopette';
  const errorAfter500ms = produce(() =>
    delay(500).then(() => {
      throw new Error(errorMessage);
    })
  );

  let productionInterrupted = false;

  return t
    .throwsAsync(
      merge(
        alpha.thru(
          tap(() => {
            t.false(productionInterrupted);
          })
        ),
        colors.thru(
          tap(() => {
            t.false(productionInterrupted);
          })
        ),
        errorAfter500ms
      )
        .thru(tap((value) => t.truthy(value)))
        .thru(drain()),
      Error
    )
    .then((error) => {
      productionInterrupted = true;
      t.is(error.message, errorMessage);
    });
});
