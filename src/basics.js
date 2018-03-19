// @flow
type EventDone = {| done: true |};
type EventError  = {| error: Error, done?: false |};
type EventValue<T>  = {| value: T, done?: false |};
export type Event<T> = EventDone | EventError | EventValue<T>;

export type Consumer<T> = (Event<T>) => Promise<boolean> | boolean;

export type Push<T> = (Event<T>) => boolean;
export type Producer<T> = (push: Push<T>, stop?: boolean) => Promise<void> | void;

export interface Stream<T> {
  consume(consumer: Consumer<T>): Promise<void>,
  push(event: Event<T>): Promise<boolean> | boolean,
  thru<R, Fn: (Stream<T>) => R>(f: Fn): R,
  toString(): string
}

function strFromEvent<T>(event: Event<T>): string {
  if (event.error) {
    return `<Error='${event.error.message}'>`;
  }
  else if (event.done) {
    return '<Done>';
  }
  else {
    // $FlowFixMe
    return `<Value=${event.value}>`;
  }
}

module.exports = {
  strFromEvent
};
