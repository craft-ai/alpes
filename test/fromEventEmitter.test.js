const EventEmitter = require('events');
const test = require('ava');
const { collect, fromEventEmitter } = require('../src');

test('Can be provided with a simple event emitter', (t) => {
  const eventEmitter = new EventEmitter();
  const stream = fromEventEmitter(eventEmitter, {
    string: (push) => (str) => push({ value: str }),
    number: (push) => (nbr) => push({ value: `${nbr}` }),
    end: (push) => () => push({ done: true })
  });
  t.is(eventEmitter.listenerCount('string'), 1);
  t.is(eventEmitter.listenerCount('number'), 1);
  t.is(eventEmitter.listenerCount('end'), 1);
  eventEmitter.emit('string', 'blah');
  eventEmitter.emit('string', 'bloh');
  eventEmitter.emit('number', 45);
  eventEmitter.emit('string', 'bluh');
  eventEmitter.emit('end');
  return collect()(stream).then((events) => {
    t.is(eventEmitter.listenerCount('string'), 0);
    t.is(eventEmitter.listenerCount('number'), 0);
    t.is(eventEmitter.listenerCount('end'), 0);
    t.deepEqual(events, ['blah', 'bloh', '45', 'bluh']);
  });
});
