// @flow
const EventEmitter = require('events');
const { StreamError } = require('./errors');
// const { strFromEvent } = require('./event');

import type { Event } from './event';

export type Push<T> = (Event<T>) => boolean;

const PRODUCER_STATUS = {
  ONGOING: 'ONGOING',
  DONE: 'DONE',
  ERROR: 'ERROR'
};
type ProducerStatus = $Keys<typeof PRODUCER_STATUS>;
export type Producer<T> = (push: Push<T>, stop?: boolean) => Promise<void> | void;

const CONSUMER_STATUS = {
  NONE: 'NONE',
  BUSY: 'BUSY',
  READY: 'READY',
  DONE: 'DONE'
};
type ConsumerStatus = $Keys<typeof CONSUMER_STATUS>;
export type Consumer<T> = (Event<T>) => Promise<boolean> | boolean;

export type InternalStreamConfiguration = {|
  bufferHighWaterMark: number
|}

const DEFAULT_INTERNAL_STREAM_CONFIGURATION : InternalStreamConfiguration = {
  bufferHighWaterMark: 100
};

class InternalStream<T> extends EventEmitter {
  cfg: InternalStreamConfiguration;

  producer: ?Producer<T>;
  producerStatus: ProducerStatus;
  buffer: Event<T>[];

  consumer: ?Consumer<T>;
  consumerStatus: ConsumerStatus;

  constructor(producer: ?Producer<T>, cfg: InternalStreamConfiguration = DEFAULT_INTERNAL_STREAM_CONFIGURATION) {
    super();
    this.producerStatus = PRODUCER_STATUS.ONGOING;
    this.producer = producer;
    this.buffer = [];
    this.cfg = cfg;

    this.consumerStatus = CONSUMER_STATUS.NONE;
    this.consumer = null;

    // this.on('consumerDone', (error) => error ? console.log('**** error', error) : console.log('**** done'));
    // this.on('consumerReady', () => console.log('**** ready'));
  }
  _handleConsumerError(error: Error) {
    this.consumerStatus = CONSUMER_STATUS.DONE;
    this.emit('consumerDone', error);
  }
  _handleConsumerAsyncResult(done: boolean) {
    if (done) {
      this.consumerStatus = CONSUMER_STATUS.DONE;
      this.emit('consumerDone');
    }
    else {
      this.consumerStatus = CONSUMER_STATUS.READY;
      this.emit('consumerReady');
    }
  }
  _handleConsumerSyncResult(done: boolean) {
    if (done) {
      this.consumerStatus = CONSUMER_STATUS.DONE;
      this.emit('consumerDone');
    }
    else {
      this.consumerStatus = CONSUMER_STATUS.READY;
    }
  }
  _consume(event: Event<T>) {
    //console.log('InternalStream._consume', strFromEvent(event), this.consumerStatus);
    // By construction we're sure that
    //  - `this.consumerStatus == CONSUMER_STATUS.READY`
    // if (this.consumerStatus != CONSUMER_STATUS.READY) {
    //   throw new Error('_consume should not be called if the consumer is not ready.');
    // }
    //  - this.consumer is defined
    // if (this.consumer == null) {
    //   throw new Error('this.consumerStatus should not be \'READY\' if no consumer is defined.');
    // }
    // $FlowFixMe
    const consumer: Consumer<T> = this.consumer;
    try {
      const consumerDone = consumer(event);
      if (consumerDone instanceof Promise) {
        this.consumerStatus = CONSUMER_STATUS.BUSY;
        // console.log('**** busy');
        consumerDone
          .then(this._handleConsumerAsyncResult.bind(this))
          .catch(this._handleConsumerError.bind(this));
      }
      else {
        this._handleConsumerSyncResult(consumerDone);
      }
    }
    catch (error) {
      this._handleConsumerError(error);
    }
  }
  _produce(event: Event<T>): boolean {
    //console.log('InternalStream._produce', strFromEvent(event));
    let productionDone = false;
    if (this.producerStatus != PRODUCER_STATUS.ONGOING) {
      throw new StreamError('No event should be produced once the stream has ended.');
    }
    else if (event.done) {
      this.producerStatus = PRODUCER_STATUS.DONE;
      productionDone = true;
    }
    else if (event.error) {
      this.producerStatus = PRODUCER_STATUS.ERROR;
      productionDone = true;
    }

    switch (this.consumerStatus) {
      case CONSUMER_STATUS.NONE:
      case CONSUMER_STATUS.BUSY:
      {
        // No consumer or busy consumer, let's buffer the event
        this.buffer.push(event);
        return !productionDone && this.buffer.length < this.cfg.bufferHighWaterMark;
      }
      case CONSUMER_STATUS.DONE:
      {
        // The consumer is done, let's just stop guys!
        return false;
      }
      default:
      {
        this._consume(event);
        return !productionDone;
      }
    }
  }
  _doConsume() {
    //console.log('InternalStream._doConsume', this.consumerStatus, this.buffer.length);

    // 1 - let's evacuate what is in the buffer
    while (
      this.buffer.length > 0 &&
      this.consumerStatus == CONSUMER_STATUS.READY
    ) {
      const event : Event<T> = this.buffer.shift();
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
          break;
        }
        if (consumerDone) {
          break;
        }
      }
    }

    if (this.consumerStatus == CONSUMER_STATUS.BUSY) {
      this.once('consumerReady', this._doConsume.bind(this));
    }
  }
  consume(consumer: Consumer<T>): Promise<void> {
    // console.log('InternalStream.consume');
    if (this.consumer != null) {
      throw new StreamError('Stream already being consumed.');
    }
    this.consumer = consumer;
    this.consumerStatus = CONSUMER_STATUS.READY;
    return new Promise((resolve, reject) => {
      this.once('consumerDone', (error) => {
        if (error) {
          reject(error);
        }
        else {
          resolve();
        }
      });
      this._doConsume();
    });
  }
  waitAndPush(event: Event<T>): Promise<boolean> | boolean {
    // console.log('InternalStream.waitAndPush', strFromEvent(event), this.consumerStatus);
    switch (this.consumerStatus) {
      case CONSUMER_STATUS.BUSY:
        return new Promise(this.once.bind(this, 'consumerReady'))
          .then(this.waitAndPush.bind(this, event));
      default:
        return this._produce(event);
    }
  }
}

module.exports = {
  InternalStream
};
