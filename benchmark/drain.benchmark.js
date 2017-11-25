const alpes = require('../lib');
const highland = require('highland');
const most = require('most');
const { benchmark, options, wrapRunner } = require('./helpers.js');

const N = 10000;

// Array of n integers
let data = new Array(N);
for (let i = 0; i < data.length; ++i) {
  data[i] = i;
}

benchmark(`drain (${data} items)`)
  .add('alpes', wrapRunner(() =>
    alpes.from(data)
      .thru(alpes.drain())),
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
