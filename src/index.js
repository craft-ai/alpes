// @flow
const { drain }  = require('./drain');
const { produce } = require('./produce');
const { transduce } = require('./transduce');
const { from, of, throwError } = require('./from');
const { chain, concatMap, map, mergeMap }  = require('./map');
const { merge }  = require('./merge');
const { reduce }  = require('./reduce');
const { subscribe }  = require('./subscribe');
const { tap }  = require('./tap');
const { transform }  = require('./transform');
const { StreamError } = require('./errors');

module.exports = {
  chain,
  concatMap,
  drain,
  from,
  map,
  merge,
  mergeMap,
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
