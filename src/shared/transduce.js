const { createBaseStream } = require('../functional/baseStream');
// const { strFromEvent } = require('./basics');

function transduce(transformer, reducer, seeder) {
  const consumeStream = (stream) => {
    // $FlowFixMe it seems the T == TransformedT case is not well handled...
    const finalReducer = transformer ? transformer(reducer) : reducer;
    let finalAccumulation = seeder();

    return stream
      .consume((event) => {
        // console.log(`${stream.toString()} - consume(${strFromEvent(event)})`);
        const reducerResult = finalReducer(finalAccumulation, event);
        if (reducerResult instanceof Promise) {
          return reducerResult.then(({ accumulation, done }) => {
            finalAccumulation = accumulation;
            // console.log(`${stream.toString()} - consume(${strFromEvent(event)}) - async finished`);
            return !!done;
          });
        } else {
          const { accumulation, done } = reducerResult;
          finalAccumulation = accumulation;
          // console.log(`${stream.toString()} - consume(${strFromEvent(event)}) - sync finished`);
          return !!done;
        }
      })
      .then(() => finalAccumulation);
  };

  return (stream) => consumeStream(stream);
}

function concatEvent(stream) {
  return (event) => {
    //console.log(`concatEvent(${stream.toString()}, ${strFromEvent(event)})`);
    const pushResult = stream.push(event);
    if (pushResult instanceof Promise) {
      return pushResult.then((done) => done);
    } else {
      return pushResult;
    }
  };
}

function reducerFromStreamReducer(reducer, stream) {
  const outputStreamReducer = reducer(stream);
  return (accumulation, event) => {
    // console.log(`${stream.toString()} - reduce(${strFromEvent(event)})`);
    const done = outputStreamReducer(event);
    if (done instanceof Promise) {
      return done.then((done) => ({
        accumulation,
        done
      }));
    } else {
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

function transduceToStream(
  transformer,
  // $FlowFixMe
  reducer = concatEvent,
  seeder = createBaseStream
) {
  return (inputStream) => {
    const outputStream = seeder();
    transduce(
      transformer,
      reducerFromStreamReducer(reducer, outputStream),
      nullSeeder
    )(inputStream).catch((error) => outputStream.push({ error }));
    return outputStream;
  };
}

module.exports = {
  concatEvent,
  transduce,
  transduceToStream
};
