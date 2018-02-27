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

class InternalStream<T> extends Readable {
  status: StreamStatus;
  constructor(producer: Producer<T> = () => {}) {
    super({
      objectMode: true,
      read() {
        producer(this.pushEvent.bind(this), this);
      }
    });
    this.status = STREAM_STATUS.OPEN;
  }
  pushEvent(event: Event<T>): boolean {
    if (this.status != STREAM_STATUS.OPEN) {
      // console.log('InternalStream.pushEvent push when not open', event);
      throw new StreamError('No event should be produced once the stream has ended.');
    }
    else if (event.done) {
      // console.log('InternalStream.pushEvent done');
      this.status = STREAM_STATUS.DONE;
      this.push(null);
      return false;
    }
    else if (event.error) {
      // console.log('InternalStream.pushEvent', event.error.toString());
      this.status = STREAM_STATUS.ERROR;
      // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
      this.push(event);
      this.push(null);
      return false;
    }
    else {
      // console.log('InternalStream.pushEvent', event.value);
      // $FlowFixMe bug in the Readable type in flow, it does not support the object mode
      return this.push(event);
    }
  }
}

module.exports = {
  STREAM_STATUS,
  InternalStream
};
