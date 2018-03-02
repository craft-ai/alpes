// @flow
const { Readable } = require('stream');
const { StreamError } = require('./errors');

const STREAM_STATUS = {
  OPEN: 'OPEN',
  DONE: 'DONE',
  ERROR: 'ERROR'
};

export type StreamStatus = $Keys<typeof STREAM_STATUS>;

type EventDone = {| done: true |};
type EventError  = {| error: Error, done?: false |};
type EventValue<T>  = {| value: T, done?: false |};
export type Event<T> = EventDone | EventError | EventValue<T>;
export type Push<T> = (Event<T>) => boolean;
export type ProducerContext = { status: StreamStatus };
export type Producer<T> = (push: Push<T>, context: ProducerContext) => void;
export type ConsumerReducer = Promise<boolean> | boolean;
export type Consumer<T> = (Event<T>) => ConsumerReducer;

class InternalStream<T> {
  status: StreamStatus;
  readable: Readable;
  constructor(producer: Producer<T> = () => {}) {
    const self = this;
    this.readable = new Readable({
      objectMode: true,
      read() {
        producer(self.push.bind(self), self);
      }
    });
    this.status = STREAM_STATUS.OPEN;
  }
  consume(consumer: Consumer<T>): Promise<void> {
    return new Promise((resolve, reject) => {
      let done: ConsumerReducer = false;

      const start = () => {
        this.readable
          .on('data', onData)
          .on('end', onEnd)
          .resume();
      };
      const finish = () => {
        this.readable
          .pause()
          .removeListener('data', onData)
          .removeListener('end', onEnd);
      };
      const onData = (event) => {
        if (event.error) {
          // console.log('stream listener error', event.error.toString());
          finish();

          done = Promise.resolve(done)
            .then(() => consumer(event));
          done.then(() => resolve(), reject);
        }
        else if (done instanceof Promise) {
          // console.log('stream listener value (Promise)', event.value);

          // -> Pause until the previous consume is done
          this.readable.pause();
          done = done
            .then((done) => {
              if (!done) {
                this.readable.resume();
                return consumer(event);
              }
              return done;
            });
          done
            .then((done) => {
              if (done) {
                finish();
                resolve();
              }
            })
            .catch((error) => {
              finish();
              reject(error);
            });
        }
        else if (!done) {
          // console.log('stream listener value (Sync)', event.value);
          try {
            done = consumer(event);
            if (!(done instanceof Promise) && done) {
              finish();
              resolve();
            }
          }
          catch (error) {
            finish();
            reject(error);
          }
        }
      };

      const onEnd = () => {
        // console.log('stream listener end');
        finish();

        done = Promise.resolve(done)
          .then(() => consumer({ done: true }));
        done.then(() => resolve(), reject);
      };

      start();
    });
  }
  push(event: Event<T>): boolean {
    if (this.status != STREAM_STATUS.OPEN) {
      // console.log('InternalStream.pushEvent push when not open', event);
      throw new StreamError('No event should be produced once the stream has ended.');
    }
    else if (event.done) {
      // console.log('InternalStream.pushEvent done');
      this.status = STREAM_STATUS.DONE;
      this.readable.push(null);
      return false;
    }
    else if (event.error) {
      // console.log('InternalStream.pushEvent', event.error.toString());
      this.status = STREAM_STATUS.ERROR;
      // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
      this.readable.push(event);
      this.readable.push(null);
      return false;
    }
    else {
      // console.log('InternalStream.pushEvent', event.value);
      // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
      return this.readable.push(event);
    }
  }
}

module.exports = {
  STREAM_STATUS,
  InternalStream
};
