const test = require('ava');
const {
  delay,
  drain,
  produce,
  StreamError,
  tap,
  transform
} = require('../src');

test('Finite streams can be produced', (t) => {
  const observedArray = [];
  return produce((push) => {
    t.true(push({ value: 1 }));
    t.true(push({ value: 2 }));
    t.true(push({ value: 3 }));
    t.false(push({ done: true }));
  })
    .thru(tap((v) => observedArray.push(v)))
    .thru(drain())
    .then(() => t.deepEqual(observedArray, [1, 2, 3]));
});

test('Pauses the production if there is a slow consumer', (t) => {
  let observedCount = 0;
  return produce((push) => {
    for (let index = 0; index < 100; index++) {
      push({ value: `blip #${index}` });
      push({ value: `blop #${index}` });
    }
    push({ done: true });
  })
    .thru(
      transform((event, push) => {
        observedCount++;
        return delay(10).then(() => push(event));
      })
    )
    .thru(drain())
    .then(() => t.is(observedCount, 201));
});

test('Pauses the production if there is a slow consumer (second version)', (t) => {
  const totalCount = 500;
  let observedCount = 0;
  let producedCount = 0;
  return produce((push) => {
    for (; producedCount < totalCount; ++producedCount) {
      if (!push({ value: `hop #${producedCount}` })) {
        ++producedCount;
        return;
      }
    }
    push({ done: true });
  })
    .thru(
      transform((event, push) => {
        return delay(10).then(() => {
          if (!event.done) {
            observedCount++;
            t.true(observedCount <= producedCount);
            // Keep a maximum lag between the producer and observer
            t.true(producedCount - observedCount <= 100);
            t.true(push(event));
          } else {
            t.false(push(event));
          }
        });
      })
    )
    .thru(drain())
    .then(() => t.is(observedCount, totalCount));
});

test('Finite streams with errors can be produced', (t) => {
  const observedArray = [];
  let value = 0;
  return t
    .throwsAsync(
      produce((push) => {
        push({ value: value++ });
        if (value > 4) {
          push({ error: new Error('my cool error') });
        }
      })
        .thru(tap((v) => observedArray.push(v)))
        .thru(drain()),
      Error
    )
    .then((error) => {
      t.is(error.message, 'my cool error');
      t.deepEqual(observedArray, [0, 1, 2, 3, 4]);
    });
});

test('Finite streams with errors can be produced (second version)', (t) => {
  const observedArray = [];
  let value = 0;
  return t
    .throwsAsync(
      produce((push) => {
        push({ value: value++ });
        if (value > 4) {
          throw new Error('my cool error');
        }
      })
        .thru(tap((v) => observedArray.push(v)))
        .thru(drain()),
      Error
    )
    .then((error) => {
      t.is(error.message, 'my cool error');
      t.deepEqual(observedArray, [0, 1, 2, 3, 4]);
    });
});

test('Push a value after done throws an error', (t) => {
  const observedArray = [];
  return produce((push) => {
    push({ value: 1 });
    push({ value: 2 });
    push({ done: true });
    t.throws(() => push({ value: 3 }), StreamError);
  })
    .thru(tap((v) => observedArray.push(v)))
    .thru(drain())
    .then(() => t.deepEqual(observedArray, [1, 2]));
});

test('Asynchronous finite streams can be produced', (t) => {
  const observedArray = [];
  return produce(
    (push, value) =>
      delay(500).then(() => {
        value = value || 0;
        push({ value: value-- });
        if (value < 0) {
          push({ done: true });
        }
        return value;
      }),
    3
  )
    .thru(tap((v) => observedArray.push(v)))
    .thru(drain())
    .then(() => t.deepEqual(observedArray, [3, 2, 1, 0]));
});

test('Asynchronous finite streams can be produced (2)', (t) => {
  const observedArray = [];
  return produce((push) => {
    return delay(10)
      .then(() => push({ value: 'hey' }))
      .then(() => delay(10))
      .then(() => push({ value: 'hey' }))
      .then(() => delay(10))
      .then(() => push({ value: 'hey' }))
      .then(() => delay(10))
      .then(() => push({ done: true }));
  })
    .thru(tap((v) => observedArray.push(v)))
    .thru(drain())
    .then(() => {
      t.deepEqual(observedArray, ['hey', 'hey', 'hey']);
    });
});

test('Asynchronous finite streams with errors can be produced', (t) => {
  const observedArray = [];
  let value = 3;
  return t
    .throwsAsync(
      produce((push) =>
        delay(500).then(() => {
          push({ value: value-- });
          if (value < 0) {
            return Promise.reject(new Error('my cool error'));
          }
        })
      )
        .thru(tap((v) => observedArray.push(v)))
        .thru(drain())
    )
    .then((error) => {
      t.is(error.message, 'my cool error');
      t.deepEqual(observedArray, [3, 2, 1, 0]);
    });
});

test('Infinite streams and slow consumer do not override the callstack', (t) => {
  const observedArray = [];
  let value = 0;
  const LIMIT = 6;
  return produce((push) => {
    push({ value: value++ });
  })
    .thru(
      transform((event, push) => {
        return new Promise((resolve) =>
          setTimeout(() => {
            if (event.error || event.done || event.value < LIMIT) {
              push(event);
            } else {
              push({ done: true });
            }
            resolve();
          }, 100)
        );
      })
    )
    .thru(tap((v) => observedArray.push(v)))
    .thru(drain())
    .then(() => t.deepEqual(observedArray, [0, 1, 2, 3, 4, 5]));
});
