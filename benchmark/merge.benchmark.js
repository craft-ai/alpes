const alpes = require('../src');
const highland = require('highland');
const most = require('most');
const { benchmark, options, wrapRunner } = require('./helpers.js');

const N = 10000;

// Array of n integers
let data = new Array(N);
for (let i = 0; i < data.length; ++i) {
  data[i] = i;
}

const sum = (x, y) => x + y;

benchmark(`merge (three streams of ${data.length} items)`)
  .add(
    'alpes',
    wrapRunner(() =>
      alpes
        .merge(alpes.from(data), alpes.from(data), alpes.from(data))
        .thru(alpes.reduce(sum, 0))
    ),
    options
  )
  .add(
    'highland',
    wrapRunner(
      () =>
        new Promise((resolve, reject) =>
          highland([highland(data), highland(data), highland(data)])
            .merge()
            .reduce(0, sum)
            .toCallback((error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            })
        )
    ),
    options
  )
  .add(
    'most',
    wrapRunner(() =>
      most
        .merge(most.from(data), most.from(data), most.from(data))
        .reduce(sum, 0)
    ),
    options
  )
  .run();
