// @flow
const { collect }  = require('./collect');
const { drain }  = require('./drain');
const { produce } = require('./produce');
const { transduce } = require('./transduce');
const { from, of, throwError } = require('./from');
const { chain, concatMap, map, mergeMap }  = require('./map');
const { concat }  = require('./concat');
const { merge }  = require('./merge');
const { reduce }  = require('./reduce');
const { subscribe }  = require('./subscribe');
const { tap }  = require('./tap');
const { transform }  = require('./transform');
const { StreamError } = require('./errors');

module.exports = {
  chain,
  collect,
  concat,
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
