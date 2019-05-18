const { StreamError } = require('./errors');
const { fromIterable } = require('./from');
const { concatEvent, transduceToStream } = require('./transduce');
//const { strFromEvent } = require('./basics');

function mergeSubstreamConsume(context, substreamEvent) {
  // console.log(`mergeSubstreamConsume(${strFromEvent(substreamEvent)}) (${context.substreamCount}/${context.substreamDoneCount}/${context.done})`);
  if (context.error) {
    return true;
  } else if (substreamEvent.done) {
    ++context.substreamDoneCount;
    if (context.done && context.substreamCount == context.substreamDoneCount) {
      return context.concatEventToStream({ done: true });
    } else {
      return false;
    }
  } else if (substreamEvent.error) {
    context.error = true;
    return context.concatEventToStream(substreamEvent);
  } else {
    return context.concatEventToStream(substreamEvent);
  }
}

function mergeStream(stream) {
  const context = {
    // $FlowFixMe
    concatEventToStream: concatEvent(stream),
    substreamCount: 0,
    substreamDoneCount: 0,
    done: false,
    error: false
  };
  // $FlowFixMe
  return (event) => {
    // console.log(`mergeStream(${stream.toString()}, ${strFromEvent(event)}) (${context.substreamCount}/${context.substreamDoneCount}/${context.done})`);
    if (event.done) {
      context.done = true;
      if (context.substreamCount == context.substreamDoneCount) {
        return context.concatEventToStream({ done: true });
      } else {
        return false;
      }
    } else if (event.error) {
      context.error = true;
      return context.concatEventToStream({ error: event.error });
    } else {
      ++context.substreamCount;
      const substream = event.value;
      // Don't wait for the full substream to be consumed.
      substream.consume(mergeSubstreamConsume.bind(null, context));
      // Forcing the return of a Promise.
      // This avoids unwinding the full _master_ stream in one go
      // Which were causing max listeners issues in the underlying event emitter.
      return Promise.resolve(false);
    }
  };
}

function merge(...substreams) {
  if (substreams.length == 0) {
    throw new StreamError(
      "'merge' needs to be provided with at least one stream."
    );
  }
  if (substreams.length == 1) {
    return substreams[0];
  }
  return transduceToStream(undefined, mergeStream)(fromIterable(substreams));
}

module.exports = {
  merge,
  mergeStream
};
