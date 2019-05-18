const { consume, createStream, push } = require('../basics/stream');
//const strFromStream = require('./basics/strFromStream');
//const strFromEvent = require('./basics/strFromEvent');

function transduce(transformer, reducer, seeder) {
  const consumeStream = (stream) => {
    // $FlowFixMe it seems the T == TransformedT case is not well handled...
    const finalReducer = transformer ? transformer(reducer) : reducer;
    let finalAccumulation = seeder();

    return consume((event) => {
      // console.log(`${strFromStream(stream)} - consume(${strFromEvent(event)})`);
      const reducerResult = finalReducer(finalAccumulation, event);
      if (reducerResult instanceof Promise) {
        return reducerResult.then(({ accumulation, done }) => {
          finalAccumulation = accumulation;
          // console.log(`${strFromStream(stream)} - consume(${strFromEvent(event)}) - async finished`);
          return !!done;
        });
      } else {
        const { accumulation, done } = reducerResult;
        finalAccumulation = accumulation;
        // console.log(`${strFromStream(stream)} - consume(${strFromEvent(event)}) - sync finished`);
        return !!done;
      }
    })(stream).then(() => finalAccumulation);
  };

  return (stream) => consumeStream(stream);
}

function concatEvent(stream) {
  return (event) => {
    //console.log(`concatEvent(${strFromStream(stream)})(${strFromEvent(event)})`);
    const pushResult = push(event)(stream);
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
    // console.log(`${strFromStream(stream)} - reduce(${strFromEvent(event)})`);
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
  reducer = concatEvent,
  seeder = createStream
) {
  return (inputStream) => {
    const outputStream = seeder();
    transduce(
      transformer,
      reducerFromStreamReducer(reducer, outputStream),
      nullSeeder
    )(inputStream).catch((error) => push({ error })(outputStream));
    return outputStream;
  };
}

module.exports = {
  concatEvent,
  transduce,
  transduceToStream
};
