# Changelog #

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased](https://github.com/craft-ai/alpes/compare/v0.0.4...HEAD) ##

### Added ###

- Introduce `rateLimit` which limits the rate of emitted event to a given interval.

## [0.0.4](https://github.com/craft-ai/alpes/compare/v0.0.3...v0.0.4) - 2018-04-05 ##

### Added ###

- Introduce `filter` which selects the event in a stream based on a given predicate evaluated on the values.

### Fixed ###

- The _main_ file is now correctly specified `require('alpes')` works properly.

## [0.0.3](https://github.com/craft-ai/alpes/compare/v0.0.2...v0.0.3) - 2018-04-05 ##

### Changed ###

- The underlying `BaseSteam.push` now returns whether or not the stream is done.

### Added ###

- Introduce `fork` which creates any number of stream acting as forks of a given stream.
- Introduce specific error types `AlreadyConsumedStreamError` and `ProduceEventOnceDoneStreamError` for these specific errors.

## [0.0.2](https://github.com/craft-ai/alpes/compare/v0.0.1...v0.0.2) - 2018-03-23 ##

### Added ###

- Introduce `collect` which consumes the stream and returns a promise to an array containing the values of the streams events.
- Introduce `batch` which groups events in a stream in arrays of up to a given size.
- Introduce `skip` and `take` which respectively take or skip a number of events from a stream.

## 0.0.1 - 2018-03-19 ##

- Initial version of **alpes**, a back-pressure stream implementation with a modern API.
- Introduce the base functional API.
  - `from`: creates a stream from an [`Iterable`](https://developer.mozilla.org/en/docs/Web/JavaScript/Guide/iterable), a Node.JS [`Readable`](https://nodejs.org/api/stream.html#stream_readable_streams), a [`Promise`](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Promise) or an [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error).
  - `of`: creates a stream from a list of items.
  - `produce`: creates a stream from a producer function.
  - `subscribe`: consumes a stream, subscribes to its events and returns a promise that fulfills when it is done.
  - `drain`: consume a stream and returns a promise that fulfills when it is done.
  - `concat`: concatenate several streams together.
  - `merge`: merge several streams together without affecting the arrival time of the events.
  - `map`: apply a given function, returning a value, to all the events in the stream.
  - `concatMap`: apply a given function, returning a stream, to all the events in the stream, keeping their ordering.
  - `chain` or `mergeMap`: apply a given function, returning a stream, to all the events in the stream, without affecting the arrival time of the events.
  - `reduce`: reduce a stream, returning a promise for the ultimate result.
  - `tap`: perform a side-effect for each event in stream.
  - `transduce`: apply [transducer](https://medium.com/@roman01la/understanding-transducers-in-javascript-3500d3bd9624) to the stream.
  - `transform`: consumes events in a stream transforming them to any number of events in the resulting stream.
