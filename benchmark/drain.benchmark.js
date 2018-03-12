const alpes = require('../lib');
const highland = require('highland');
const most = require('most');
const { benchmark, options, wrapRunner } = require('./helpers.js');
const { Readable } = require('stream');

const N = 10000;

// Array of n integers
let data = new Array(N);
for (let i = 0; i < data.length; ++i) {
  data[i] = i;
}

benchmark(`drain (${data.length} items)`)
  .add('alpes', wrapRunner(() =>
    alpes.from(data)
      .thru(alpes.drain())),
  options)
  .add('node streams', wrapRunner(() => new Promise((resolve, reject) => {
    const iterator = data[Symbol.iterator]();
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
      .on('end', resolve)
      .on('error', reject);
    stream.resume();
  })),
  options)
  .add('highland', wrapRunner(() => new Promise((resolve, reject) =>
    highland(data)
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
      .drain()),
  options)
  .run();
