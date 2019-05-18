const EventEmitter = require('events');
const {
  AlreadyConsumedStreamError,
  ProduceEventOnceDoneStreamError
} = require('./errors');
// const strFromEvent = require('./strFromEvent');
// const strFromStream = require('./strFromStream');

const PRODUCER_STATUS = {
  ONGOING: 'ONGOING',
  DONE: 'DONE',
  ERROR: 'ERROR'
};

const CONSUMER_STATUS = {
  NONE: 'NONE',
  BUSY: 'BUSY',
  READY: 'READY',
  DONE: 'DONE'
};

const DEFAULT_STREAM_CONFIGURATION = {
  bufferHighWaterMark: 100
};

let nextStreamId = 0;

function createStream(producer, cfg = DEFAULT_STREAM_CONFIGURATION) {
  const stream = {
    id: nextStreamId++,

    producerStatus: PRODUCER_STATUS.ONGOING,
    producer,
    buffer: [],
    cfg,

    consumerStatus: CONSUMER_STATUS.NONE,
    consumer: null,

    eventEmitter: new EventEmitter()
  };

  stream.createStream = (producer, childCfg = cfg) =>
    createStream(producer, childCfg);

  return stream;
}

function _handleConsumerError(stream, error) {
  //console.log(`_handleConsumerError(${strFromStream(stream)}, ${error.toString()})`);
  stream.consumerStatus = CONSUMER_STATUS.DONE;
  stream.eventEmitter.emit('consumerDone', error);
}

function _handleConsumerAsyncResult(stream, done) {
  //console.log(`_handleConsumerAsyncResult(${strFromStream(stream)}, ${done.toString()})`);
  if (done) {
    stream.consumerStatus = CONSUMER_STATUS.DONE;
    stream.eventEmitter.emit('consumerDone');
  } else {
    stream.consumerStatus = CONSUMER_STATUS.READY;
    stream.eventEmitter.emit('consumerReady');
  }
}

function _handleConsumerSyncResult(stream, done) {
  // console.log(`_handleConsumerSyncResult(${strFromStream(stream)}, ${done.toString()})`);
  if (done) {
    stream.consumerStatus = CONSUMER_STATUS.DONE;
    stream.eventEmitter.emit('consumerDone');
  } else {
    stream.consumerStatus = CONSUMER_STATUS.READY;
  }
}

function _consume(stream, event) {
  //console.log(`_consume(${strFromStream(stream)}, ${strFromEvent(event)})`);
  // By construction we're sure that
  //  - `stream.consumerStatus == CONSUMER_STATUS.READY`
  // if (stream.consumerStatus != CONSUMER_STATUS.READY) {
  //   throw new Error('_consume should not be called if the consumer is not ready.');
  // }
  //  - stream.consumer is defined
  // if (stream.consumer == null) {
  //   throw new Error('stream.consumerStatus should not be \'READY\' if no consumer is defined.');
  // }
  const consumer = stream.consumer;
  try {
    const consumerDone = consumer(event);
    if (consumerDone instanceof Promise) {
      stream.consumerStatus = CONSUMER_STATUS.BUSY;
      consumerDone
        .then(_handleConsumerAsyncResult.bind(null, stream))
        .catch(_handleConsumerError.bind(null, stream));
    } else {
      _handleConsumerSyncResult(stream, consumerDone);
    }
  } catch (error) {
    _handleConsumerError(stream, error);
  }
}

function _isReadyToProduce(stream) {
  switch (stream.producerStatus) {
    case PRODUCER_STATUS.ERROR:
    case PRODUCER_STATUS.DONE:
      return false;
    default:
  }
  switch (stream.consumerStatus) {
    case CONSUMER_STATUS.DONE:
      return false;
    case CONSUMER_STATUS.NONE:
    case CONSUMER_STATUS.BUSY:
      return stream.buffer.length < stream.cfg.bufferHighWaterMark;
    default:
      return true;
  }
}

function _isDone(stream) {
  return (
    stream.consumerStatus == CONSUMER_STATUS.DONE ||
    stream.producerStatus != PRODUCER_STATUS.ONGOING
  );
}

function _produce(stream, event) {
  //console.log(`_produce(${strFromStream(stream)}, ${strFromEvent(event)})`);
  switch (stream.producerStatus) {
    case PRODUCER_STATUS.DONE:
    case PRODUCER_STATUS.ERROR: {
      // Only throw when the producer has ended (the only case when it's the producer's fault)
      throw new ProduceEventOnceDoneStreamError(event, stream);
    }
    default: {
      if (event.done) {
        stream.producerStatus = PRODUCER_STATUS.DONE;
      } else if (event.error) {
        stream.producerStatus = PRODUCER_STATUS.ERROR;
      }
    }
  }

  switch (stream.consumerStatus) {
    case CONSUMER_STATUS.NONE:
    case CONSUMER_STATUS.BUSY: {
      // No consumer or busy consumer, let's buffer the event
      stream.buffer.push(event);
      return _isReadyToProduce(stream);
    }
    case CONSUMER_STATUS.DONE: {
      // The consumer is done, let's just stop guys!
      return false;
    }
    default: {
      _consume(stream, event);
      return _isReadyToProduce(stream);
    }
  }
}

function _doConsume(stream) {
  // console.log(`_doConsume(${strFromStream(stream)})`);

  // 1 - let's evacuate what is in the buffer
  while (
    stream.buffer.length > 0 &&
    stream.consumerStatus == CONSUMER_STATUS.READY
  ) {
    const event = stream.buffer.shift();
    _consume(stream, event);
  }
  // 2 - nothing in the buffer, let's produce!
  if (stream.producer != null) {
    const producer = stream.producer;
    while (
      stream.producerStatus == PRODUCER_STATUS.ONGOING &&
      stream.consumerStatus != CONSUMER_STATUS.BUSY
    ) {
      const consumerDone = stream.consumerStatus == CONSUMER_STATUS.DONE;
      const producerResult = producer(
        _produce.bind(null, stream),
        consumerDone
      );
      if (producerResult instanceof Promise) {
        producerResult.then(_doConsume.bind(null, stream));
        return;
      }
      if (consumerDone) {
        return;
      }
    }
  }

  if (stream.consumerStatus != CONSUMER_STATUS.DONE) {
    stream.eventEmitter.once('consumerReady', _doConsume.bind(null, stream));
  }
}

function consume(consumer) {
  return (stream) => {
    //console.log(`consume(...)(${strFromStream(stream)})`);
    if (stream.consumer != null) {
      throw new AlreadyConsumedStreamError(stream);
    }
    stream.consumer = consumer;
    stream.consumerStatus = CONSUMER_STATUS.READY;
    stream.eventEmitter.emit('consumerReady');
    return new Promise((resolve, reject) => {
      stream.eventEmitter.once('consumerDone', (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
      //console.log('calling doConsume at the start of consumption');
      _doConsume(stream);
    });
  };
}

function push(event, resilientToDone = false) {
  if (resilientToDone) {
    const doPush = (stream) => {
      // console.log(
      //   `push(${strFromEvent(event)}, true)(${strFromStream(stream)})`
      // );
      if (_isDone(stream)) {
        return true;
      } else if (_isReadyToProduce(stream)) {
        _produce(stream, event);
        return _isDone(stream);
      } else {
        return new Promise(
          stream.eventEmitter.once.bind(stream.eventEmitter, 'consumerReady')
        ).then(() => doPush(stream));
      }
    };
    return doPush;
  } else {
    const resilientPush = push(event, true);
    return (stream) => {
      // console.log(
      //   `push(${strFromEvent(event)}, false)(${strFromStream(stream)})`
      // );
      if (_isDone(stream)) {
        throw new ProduceEventOnceDoneStreamError(event, stream);
      } else if (_isReadyToProduce(stream)) {
        _produce(stream, event);
        return _isDone(stream);
      } else {
        return new Promise(
          stream.eventEmitter.once.bind(stream.eventEmitter, 'consumerReady')
        ).then(() => resilientPush(stream));
      }
    };
  }
}

module.exports = {
  DEFAULT_STREAM_CONFIGURATION,
  createStream,
  consume,
  push,
  _isDone
};
