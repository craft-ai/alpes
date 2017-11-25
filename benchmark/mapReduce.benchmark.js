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

const addOne = (x) => x + 1;
const sum = (x, y) => x + y;

benchmark(`map -> reduce (${data} items)`)
  .add('alpes', wrapRunner(() =>
    alpes.from(data)
      .thru(alpes.map(addOne))
      .thru(alpes.reduce(sum, 0))),
  options)
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
