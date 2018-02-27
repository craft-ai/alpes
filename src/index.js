// @flow
const { drain }  = require('./drain');
const { from, of, produce, subscribe, throwError, transduce, transform } = require('./basics');
const { map }  = require('./map');
const { reduce }  = require('./reduce');
const { tap }  = require('./tap');
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
