// @flow
const { AlreadyConsumedStreamError, ProduceEventOnceDoneStreamError, StreamError } = require('./errors');
const { batch }  = require('./batch');
const { chain, concatMap, map, mergeMap }  = require('./map');
const { collect }  = require('./collect');
const { concat }  = require('./concat');
const { drain }  = require('./drain');
const { filter }  = require('./filter');
const { fork }  = require('./fork');
const { from, fromEventEmitter, of, throwError } = require('./from');
const { merge }  = require('./merge');
const { produce } = require('./produce');
const { rateLimit }  = require('./rateLimit');
const { reduce }  = require('./reduce');
const { scan }  = require('./scan');
const { skip }  = require('./skip');
const { subscribe }  = require('./subscribe');
const { take }  = require('./take');
const { tap }  = require('./tap');
const { transduce } = require('./transduce');
const { transform }  = require('./transform');

module.exports = {
  AlreadyConsumedStreamError,
  batch,
  chain,
  collect,
  concat,
  concatMap,
  drain,
  filter,
  fork,
  from,
  fromEventEmitter,
  map,
  merge,
  mergeMap,
  of,
  produce,
  ProduceEventOnceDoneStreamError,
  rateLimit,
  reduce,
  scan,
  skip,
  StreamError,
  subscribe,
  take,
  tap,
  throwError,
  transduce,
  transform
};
