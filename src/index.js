// @flow
const { batch }  = require('./batch');
const { chain, concatMap, map, mergeMap }  = require('./map');
const { collect }  = require('./collect');
const { concat }  = require('./concat');
const { drain }  = require('./drain');
const { from, of, throwError } = require('./from');
const { merge }  = require('./merge');
const { produce } = require('./produce');
const { reduce }  = require('./reduce');
const { skip }  = require('./skip');
const { StreamError } = require('./errors');
const { subscribe }  = require('./subscribe');
const { take }  = require('./take');
const { tap }  = require('./tap');
const { transduce } = require('./transduce');
const { transform }  = require('./transform');

module.exports = {
  batch,
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
  skip,
  StreamError,
  subscribe,
  take,
  tap,
  throwError,
  transduce,
  transform
};
