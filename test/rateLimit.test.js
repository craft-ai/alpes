const test = require('ava');
const { delay, map, of, produce, rateLimit, reduce } = require('../src');

test('Can limit the throughput of a stream to one event every 500ms', (t) => {
  return of(0, 1, 2, 3, 4, 5)
    .thru(rateLimit(500))
    .thru(map(() => Date.now()))
    .thru(
      reduce((from, to) => {
        if (from) {
          t.true(to - from >= 490);
          t.true(to - from < 550);
        }
        return to;
      }, undefined)
    );
});

test('Does not limit the throughput of a stream when it is slower', (t) => {
  return produce((push, value) => {
    if (value == null) {
      throw new Error('aaaaaah');
    }
    value -= 1;
    push({ value });
    if (value <= 0) {
      push({ done: true });
    }
    return delay(1000).then(() => value);
  }, 5)
    .thru(rateLimit(500))
    .thru(map(() => Date.now()))
    .thru(
      reduce((from, to) => {
        if (from) {
          t.true(to - from >= 990);
          t.true(to - from < 1010);
        }
        return to;
      }, undefined)
    );
});
