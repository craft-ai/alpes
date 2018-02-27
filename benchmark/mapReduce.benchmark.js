const alpes = require('../lib');
const highland = require('highland');
const most = require('most');
const { benchmark, options, wrapRunner } = require('./helpers.js');
const { Readable, Transform } = require('stream');

const N = 10000;

// Array of n integers
let data = new Array(N);
for (let i = 0; i < data.length; ++i) {
  data[i] = i;
}

const addOne = (x) => x + 1;
const sum = (x, y) => x + y;

benchmark(`map -> reduce (${data} items)`)
  .add('alpes (map and reduce)', wrapRunner(() =>
    alpes.from(data)
      .thru(alpes.map(addOne))
      .thru(alpes.reduce(sum, 0))),
  options)
  .add('alpes (transduce)', wrapRunner(() =>
    alpes.from(data)
      .thru(alpes.transduce(
        (reducer) => (accumulation, event) => {
          if (event.done || event.error) {
            return reducer(accumulation, event);
          }
          else {
            return reducer(accumulation, {
              value: addOne(event.value)
            });
          }
        },
        (accumulation, event) => {
          if (event.done) {
            return { accumulation, done: true };
          }
          else if (event.error) {
            throw event.error;
          }
          else {
            return {
              accumulation: sum(accumulation, event.value),
              done: false
            };
          }
        },
        () => 0))),
  options)
  .add('node streams', wrapRunner(() => new Promise((resolve, reject) => {
    const iterator = data[Symbol.iterator]();
    let reducedValue = 0;
    const stream = new Readable({
      objectMode: true,
      read() {
        for (;;) {
          const { done, value } = iterator.next();
          if (done) {
            this.push(null);
            return;
          }
          if (!this.push(value)) {
            return;
          }
        }
      }
    })
      .pipe(
        new Transform({
          objectMode: true,
          transform(value, _, callback) {
            callback(null, addOne(value));
          }
        })
      )
      .on('data', (value) => {
        reducedValue = sum(value, reducedValue);
      })
      .on('end', () => resolve(reducedValue))
      .on('error', reject);
    stream.resume();
  })), options)
  .add('highland', wrapRunner(() => new Promise((resolve, reject) =>
    highland(data)
      .map(addOne)
      .reduce(0, sum)
      .toCallback((error, value) => {
        if (error) {
          reject(error);
        }
        else {
          resolve();
        }
      }))),
  options)
  .add('most', wrapRunner(() =>
    most.from(data)
      .map(addOne)
      .reduce(sum, 0)),
  options)
  .run();
