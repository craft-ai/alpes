const EventEmitter = require('events');
const {
  AlreadyConsumedStreamError,
  ProduceEventOnceDoneStreamError
} = require('./errors');
// const { strFromEvent } = require('./basics');

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

const DEFAULT_INTERNAL_STREAM_CONFIGURATION = {
  bufferHighWaterMark: 100
};

let nextStreamId = 0;

class BaseStream extends EventEmitter {
  constructor(producer, cfg = DEFAULT_INTERNAL_STREAM_CONFIGURATION) {
    super();
    this.id = nextStreamId++;

    this.producerStatus = PRODUCER_STATUS.ONGOING;
    this.producer = producer;
    this.buffer = [];
    this.cfg = cfg;

    this.consumerStatus = CONSUMER_STATUS.NONE;
    this.consumer = null;

    //this.on('consumerReady', () => console.log(`${this.toString()}.on('consumerReady')`));
  }
  _handleConsumerError(error) {
    //console.log(`${this.toString()}._handleConsumerError(${error.toString()})`);
    this.consumerStatus = CONSUMER_STATUS.DONE;
    this.emit('consumerDone', error);
  }
  _handleConsumerAsyncResult(done) {
    //console.log(`${this.toString()}._handleConsumerAsyncResult(${done.toString()})`);
    if (done) {
      this.consumerStatus = CONSUMER_STATUS.DONE;
      this.emit('consumerDone');
    } else {
      this.consumerStatus = CONSUMER_STATUS.READY;
      this.emit('consumerReady');
    }
  }
  _handleConsumerSyncResult(done) {
    // console.log(`${this.toString()}._handleConsumerSyncResult(${done.toString()})`);
    if (done) {
      this.consumerStatus = CONSUMER_STATUS.DONE;
      this.emit('consumerDone');
    } else {
      this.consumerStatus = CONSUMER_STATUS.READY;
    }
  }
  _consume(event) {
    //console.log(`${this.toString()}._consume(${strFromEvent(event)})`);
    // By construction we're sure that
    //  - `this.consumerStatus == CONSUMER_STATUS.READY`
    // if (this.consumerStatus != CONSUMER_STATUS.READY) {
    //   throw new Error('_consume should not be called if the consumer is not ready.');
    // }
    //  - this.consumer is defined
    // if (this.consumer == null) {
    //   throw new Error('this.consumerStatus should not be \'READY\' if no consumer is defined.');
    // }
    const consumer = this.consumer;
    try {
      const consumerDone = consumer(event);
      if (consumerDone instanceof Promise) {
        this.consumerStatus = CONSUMER_STATUS.BUSY;
        consumerDone
          .then(this._handleConsumerAsyncResult.bind(this))
          .catch(this._handleConsumerError.bind(this));
      } else {
        this._handleConsumerSyncResult(consumerDone);
      }
    } catch (error) {
      this._handleConsumerError(error);
    }
  }
  _isDone() {
    return (
      this.consumerStatus == CONSUMER_STATUS.DONE ||
      this.producerStatus != PRODUCER_STATUS.ONGOING
    );
  }
  _isReadyToProduce() {
    switch (this.producerStatus) {
      case PRODUCER_STATUS.ERROR:
      case PRODUCER_STATUS.DONE:
        return false;
      default:
    }
    switch (this.consumerStatus) {
      case CONSUMER_STATUS.DONE:
        return false;
      case CONSUMER_STATUS.NONE:
      case CONSUMER_STATUS.BUSY:
        return this.buffer.length < this.cfg.bufferHighWaterMark;
      default:
        return true;
    }
  }
  _produce(event) {
    //console.log(`${this.toString()}._produce(${strFromEvent(event)})`);
    switch (this.producerStatus) {
      case PRODUCER_STATUS.DONE:
      case PRODUCER_STATUS.ERROR: {
        // Only throw when the producer has ended (the only case when it's the producer's fault)
        throw new ProduceEventOnceDoneStreamError(event, this);
      }
      default: {
        if (event.done) {
          this.producerStatus = PRODUCER_STATUS.DONE;
        } else if (event.error) {
          this.producerStatus = PRODUCER_STATUS.ERROR;
        }
      }
    }

    switch (this.consumerStatus) {
      case CONSUMER_STATUS.NONE:
      case CONSUMER_STATUS.BUSY: {
        // No consumer or busy consumer, let's buffer the event
        this.buffer.push(event);
        return this._isReadyToProduce();
      }
      case CONSUMER_STATUS.DONE: {
        // The consumer is done, let's just stop guys!
        return false;
      }
      default: {
        this._consume(event);
        return this._isReadyToProduce();
      }
    }
  }
  _doConsume() {
    //console.log(`${this.toString()}._doConsume()`);

    // 1 - let's evacuate what is in the buffer
    while (
      this.buffer.length > 0 &&
      this.consumerStatus == CONSUMER_STATUS.READY
    ) {
      const event = this.buffer.shift();
      this._consume(event);
    }
    // 2 - nothing in the buffer, let's produce!
    if (this.producer != null) {
      const producer = this.producer;
      while (
        this.producerStatus == PRODUCER_STATUS.ONGOING &&
        this.consumerStatus != CONSUMER_STATUS.BUSY
      ) {
        const consumerDone = this.consumerStatus == CONSUMER_STATUS.DONE;
        const producerResult = producer(this._produce.bind(this), consumerDone);
        if (producerResult instanceof Promise) {
          producerResult.then(this._doConsume.bind(this));
          return;
        }
        if (consumerDone) {
          return;
        }
      }
    }

    if (this.consumerStatus != CONSUMER_STATUS.DONE) {
      this.once('consumerReady', this._doConsume.bind(this));
    }
  }
  consume(consumer) {
    //console.log(`${this.toString()}.consume(...)`);
    if (this.consumer != null) {
      throw new AlreadyConsumedStreamError(this);
    }
    this.consumer = consumer;
    this.consumerStatus = CONSUMER_STATUS.READY;
    this.emit('consumerReady');
    return new Promise((resolve, reject) => {
      this.once('consumerDone', (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
      //console.log('calling doConsume at the start of consumption');
      this._doConsume();
    });
  }
  push(event, resilientToDone) {
    //console.log(`${this.toString()}.push(${strFromEvent(event)})`);
    if (this._isDone()) {
      if (resilientToDone) {
        return true;
      }
      throw new ProduceEventOnceDoneStreamError(event, this);
    } else if (this._isReadyToProduce()) {
      this._produce(event);
      //console.log(`${this.toString()}.push(${strFromEvent(event)}) - finished`);
      return this._isDone();
    } else {
      //console.log(`${this.toString()}.push(${strFromEvent(event)}) - busy`);
      return new Promise(this.once.bind(this, 'consumerReady')).then(
        this.push.bind(this, event, true)
      );
    }
  }
  thru(f) {
    return f(this);
  }
  toString() {
    return `[BaseStream #${this.id} { producer: ${
      this.producerStatus
    }, consumer: ${this.consumerStatus}, buffer.length: ${
      this.buffer.length
    } }]`;
  }
}

function createBaseStream(
  producer,
  cfg = DEFAULT_INTERNAL_STREAM_CONFIGURATION
) {
  return new BaseStream(producer, cfg);
}

module.exports = {
  createBaseStream
};
