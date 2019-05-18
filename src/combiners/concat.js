const { StreamError } = require('../basics/errors');
const { fromIterable } = require('../creators/from');
const { concatEvent, transduceToStream } = require('../transfomers/transduce');
const { consume } = require('../basics/stream');
//const strFromStream = require('./basics/strFromStream');
//const strFromEvent = require('./basics/strFromEvent');

function concatStream(stream) {
  const concatEventToStream = concatEvent(stream);
  return (event) => {
    //console.log(`concatStream(${strFromStream(stream)}, ${strFromEvent(event)})`);
    if (event.done) {
      return concatEventToStream({ done: true });
    } else if (event.error) {
      return concatEventToStream({ error: event.error });
    } else {
      const substream = event.value;
      // Wait for the full substream to be consumed.
      let substreamDone = false;
      return consume((substreamEvent) => {
        if (substreamEvent.done) {
          return true;
        }
        if (substreamEvent.error) {
          substreamDone = true;
        }
        return concatEventToStream(substreamEvent);
      })(substream).then(() => substreamDone);
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
  return transduceToStream(undefined, concatStream)(
    fromIterable(substreams)(substreams[0].createStream)
  );
}

module.exports = {
  concat,
  concatStream
};
