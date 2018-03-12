// @flow
const { drain }  = require('./drain');
const { from, of, produce, throwError, transduce } = require('./basics');
const { map }  = require('./map');
const { reduce }  = require('./reduce');
const { subscribe }  = require('./subscribe');
const { tap }  = require('./tap');
const { transform }  = require('./transform');
const { StreamError } = require('./errors');

module.exports = {
  drain,
  from,
  map,
  of,
  produce,
  reduce,
  StreamError,
  subscribe,
  tap,
  throwError,
  transduce,
  transform
};
