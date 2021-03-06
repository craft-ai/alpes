function strFromEvent(event) {
  if (event.error) {
    return `<Error='${event.error.message}'>`;
  } else if (event.done) {
    return '<Done>';
  } else {
    return `<Value=${event.value}>`;
  }
}

module.exports = strFromEvent;
