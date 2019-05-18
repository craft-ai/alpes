const { StreamError } = require('./errors');
const { fromIterable } = require('./from');
const { concatEvent, transduceToStream } = require('./transduce');
//const { strFromEvent } = require('./basics');

function concatStream(stream) {
  // $FlowFixMe
  const concatEventToStream = concatEvent(stream);
  // $FlowFixMe
  return (event) => {
    //console.log(`concatStream(${stream.toString()}, ${strFromEvent(event)})`);
    if (event.done) {
      return concatEventToStream({ done: true });
    } else if (event.error) {
      return concatEventToStream({ error: event.error });
    } else {
      const substream = event.value;
      // Wait for the full substream to be consumed.
      let substreamDone = false;
      return substream
        .consume((substreamEvent) => {
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

function concat(...substreams) {
  if (substreams.length == 0) {
    throw new StreamError(
      "'concat' needs to be provided with at least one stream."
    );
  }
  if (substreams.length == 1) {
    return substreams[0];
  }
  return transduceToStream(undefined, concatStream)(fromIterable(substreams));
}

module.exports = {
  concat,
  concatStream
};
