// @flow
const { createBaseStream } = require('./baseStream');
const { StreamError } = require('./errors');
//const { strFromEvent } = require('./basics');

import type { Consumer, Event, Stream } from './basics';

type Context<T> = {|
  stream: Stream<T>,
  substreamsDone: boolean[],
  done: boolean
|};

function createSubstreamConsumer<T>(stream: Stream<T>, index: number, ctx: Context<T>): Consumer<T> {
  return (event: Event<T>) => {
    // If the merged stream is done let's stop everything.
    if (ctx.done) {
      return true;
    }
    // console.log(`Stream #${index} - Event ${strFromEvent(event)}`);
    if (event.done) {
      ctx.substreamsDone[index] = true;
      ctx.done = ctx.substreamsDone.every((done) => done);
      if (!ctx.done) {
        // Ignoring the 'done' events if not all the stream has ended.
        return false;
      }
    }
    else if (event.error) {
      ctx.done = true;
    }

    // Pushing every other events
    const pushResult = ctx.stream.push(event);
    if (pushResult instanceof Promise) {
      return pushResult.then(() => ctx.done);
    }
    else {
      return ctx.done;
    }
  };
}

function merge<T>(...substreams: Stream<T>[]): Stream<T> {
  if (substreams.length == 0) {
    throw new StreamError('\'merge\' needs to be provided with at least one stream.');
  }
  if (substreams.length == 1) {
    return substreams[0];
  }
  const ctx: Context<T> = {
    stream: createBaseStream(),
    substreamsDone: substreams.map(() => false),
    done: false,
  };
  substreams.forEach((stream: Stream<T>, index: number) => {
    const consumer = createSubstreamConsumer(stream, index, ctx);
    stream.consume(consumer);
  });
  return ctx.stream;
}

module.exports = {
  merge
};
