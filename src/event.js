// @flow
type EventDone = {| done: true |};
type EventError  = {| error: Error, done?: false |};
type EventValue<T>  = {| value: T, done?: false |};
export type Event<T> = EventDone | EventError | EventValue<T>;

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
