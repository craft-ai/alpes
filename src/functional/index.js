const {
  AlreadyConsumedStreamError,
  ProduceEventOnceDoneStreamError,
  StreamError
} = require('../basics/errors');
const { batch } = require('../shared/batch');
const { chain, concatMap, map, mergeMap } = require('../shared/map');
const { collect } = require('../shared/collect');
const { concat } = require('../shared/concat');
const { drain } = require('../shared/drain');
const { filter } = require('../shared/filter');
const { fork } = require('../shared/fork');
const {
  from,
  fromEventEmitter,
  fromIterable,
  throwError
} = require('../shared/from');
const { merge } = require('../shared/merge');
const { produce } = require('../shared/produce');
const { rateLimit } = require('../shared/rateLimit');
const { reduce } = require('../shared/reduce');
const { scan } = require('../shared/scan');
const { skip } = require('../shared/skip');
const { subscribe } = require('../shared/subscribe');
const { take } = require('../shared/take');
const { tap } = require('../shared/tap');
const { transduce } = require('../shared/transduce');
const { transform } = require('../shared/transform');

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
  of: (...args) => fromIterable(args),
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
