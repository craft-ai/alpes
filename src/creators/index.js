const { from, fromEventEmitter, fromIterable, fromError } = require('./from');
const { produce } = require('./produce');

function of(...args) {
  return fromIterable(args);
}

function throwError(error) {
  return fromError(error);
}
module.exports = {
  from,
  fromError,
  fromEventEmitter,
  fromIterable,
  of,
  produce,
  throwError
};
