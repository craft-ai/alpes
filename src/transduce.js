// @flow
const { createBaseStream } = require('./baseStream');
const { strFromEvent } = require('./basics');

import type { Event, Stream } from './basics';

type SyncReducerResult<T> = {| accumulation: T, done: ?boolean |}
type AsyncReducerResult<T> = Promise<SyncReducerResult<T>>
export type ReducerResult<T> = AsyncReducerResult<T> | SyncReducerResult<T>
export type Reducer<T, AccumulationT> = (AccumulationT, Event<T>) => ReducerResult<AccumulationT>;
export type Transformer<T, TransformedT, AccumulationT> = (Reducer<TransformedT, AccumulationT>) => Reducer<T, AccumulationT>;
export type Seeder<AccumulationT> = () => AccumulationT;

function transduce<T, TransformedT, AccumulationT>(
  transformer?: Transformer<T, TransformedT, AccumulationT>,
  reducer: Reducer<TransformedT, AccumulationT>,
  seeder: Seeder<AccumulationT>): (Stream<T>) => Promise<AccumulationT> {

  const consumeStream = (stream) => {
    // $FlowFixMe it seems the T == TransformedT case is not well handled...
    const finalReducer: Reducer<T, AccumulationT> = transformer ? transformer(reducer) : reducer;
    let finalAccumulation = seeder();

    return stream.consume((event) => {
      const reducerResult = finalReducer(finalAccumulation, event);
      if (reducerResult instanceof Promise) {
        return reducerResult.then(({ accumulation, done }) => {
          finalAccumulation = accumulation;
          return !!done;
        });
      }
      else {
        const { accumulation, done } = reducerResult;
        finalAccumulation = accumulation;
        return !!done;
      }
    })
      .then(() => finalAccumulation);
  };

  return (stream) => consumeStream(stream);
}

export type StreamReducer<T, AccumulationT> = (Stream<AccumulationT>) => (Event<T>) => Promise<boolean> | boolean;

function concatEvent<T>(stream: Stream<T>) {
  return (event: Event<T>): Promise<boolean> | boolean => {
    // console.log(`concatEvent(${stream.toString()}, ${strFromEvent(event)})`);
    const pushResult = stream.push(event);
    const done = event.done || (event.error && true);
    if (pushResult instanceof Promise) {
      return pushResult.then(() => !!done);
    }
    else {
      return !!done;
    }
  };
}

function concatStream<T>(stream: Stream<T>) {
  // $FlowFixMe
  const concatEventToStream: (Event<T>) => Promise<boolean> | boolean = concatEvent(stream);
  return (event: Event<Stream<T>>): Promise<boolean> | boolean => {
    //console.log(`concatStream(${stream.toString()}, ${strFromEvent(event)})`);
    if (event.done) {
      return concatEventToStream({ done: true });
    }
    else if (event.error) {
      return concatEventToStream({ error: event.error });
    }
    else {
      const substream = event.value;
      // Wait for the full substream to be consumed.
      let substreamDone = false;
      return substream.consume((substreamEvent: Event<T>) => {
        if (substreamEvent.done) {
          return true;
        }
        if (substreamEvent.error) {
          substreamDone = true;
        }
        return concatEventToStream(substreamEvent);
      })
        .then(() => substreamDone);
    }
  };
}

function mergeStream<T>(stream: Stream<T>) {
  // $FlowFixMe
  const concatEventToStream: (Event<T>) => Promise<boolean> | boolean = concatEvent(stream);
  let substreamCount = 0;
  let substreamDoneCount = 0;
  let streamDone = false;
  return (event: Event<Stream<T>>): Promise<boolean> | boolean => {
    //console.log(`mergeStream(${stream.toString()}, ${strFromEvent(event)}) (${substreamCount}/${substreamDoneCount}/${streamDone})`);
    if (event.done) {
      streamDone = true;
      if (streamDone && substreamCount == substreamDoneCount) {
        return concatEventToStream({ done: true });
      }
      else {
        return false;
      }
    }
    else if (event.error) {
      return concatEventToStream({ error: event.error });
    }
    else {
      ++substreamCount;
      const substream = event.value;
      // Don't wait for the full substream to be consumed.
      substream.consume((substreamEvent: Event<T>) => {
        //console.log(`substream.consume(${substream.toString()}, ${strFromEvent(substreamEvent)}) (${substreamCount}/${substreamDoneCount}/${streamDone})`);
        if (substreamEvent.done) {
          ++substreamDoneCount;
          if (streamDone && substreamCount == substreamDoneCount) {
            return concatEventToStream({ done: true });
          }
          else {
            return false;
          }
        }
        else {
          return concatEventToStream(substreamEvent);
        }
      });
      return false;
    }
  };
}

function reducerFromStreamReducer<TransformedT, AccumulationT>(
  reducer: StreamReducer<TransformedT, AccumulationT>,
  stream: Stream<AccumulationT>): Reducer<TransformedT, void> {
  const outputStreamReducer = reducer(stream);
  return (accumulation: void, event: Event<TransformedT>) => {
    const done = outputStreamReducer(event);
    if (done instanceof Promise) {
      return done.then((done) => ({
        accumulation,
        done
      }));
    }
    else {
      return {
        accumulation,
        done
      };
    }
  };
}

function nullSeeder() {
  return;
}

function transduceToStream<T, TransformedT, AccumulationT>(
  transformer?: Transformer<T, TransformedT, void>,
  // $FlowFixMe
  reducer: StreamReducer<TransformedT, AccumulationT> = concatEvent,
  seeder: Seeder<Stream<AccumulationT>> = createBaseStream): (Stream<T>) => Stream<AccumulationT> {
  return (inputStream) => {
    const outputStream = seeder();
    transduce(
      transformer,
      reducerFromStreamReducer(reducer, outputStream),
      nullSeeder)(inputStream)
      .catch((error) => outputStream.push({ error }));
    return outputStream;
  };
}

module.exports = {
  concatEvent,
  concatStream,
  mergeStream,
  transduce,
  transduceToStream
};
