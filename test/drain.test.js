// @flow
import test from 'ava';
import { drain, of, StreamError, tap } from '../src';

test('Unable to drain a single stream twice', (t) => {
  const stream = of(0, 1, 2);
  const drainedStream1 = drain()(stream);
  t.truthy(drainedStream1);
  t.throws(() => drain()(stream), StreamError);
});

test('Unable to drain and tap the same stream', (t) => {
  const stream = of(0, 1, 2);
  const drainedStream1 = drain()(stream);
  t.truthy(drainedStream1);
  t.throws(() => tap(() => undefined)(stream), StreamError);
});
