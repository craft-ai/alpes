/* eslint-disable no-console */
const Benchmark = require('benchmark');

function wrapRunner(benchmarkPromise) {
  return (deferred) => {
    benchmarkPromise()
      .then(() => {
        deferred.resolve();
      })
      .catch((error) => {
        deferred.benchmark.emit({ type: 'error', error });
        deferred.resolve(error);
      });
  };
}

const options = {
  defer: true,
  onError: function(e) {
    e.currentTarget.failure = e.error;
  }
};

function benchmark(title) {
  const suite = Benchmark.Suite(title);
  console.log(`# ${title} #`);
  return suite
    .on('error', function(event) {
      console.log('error', event.target.error);
    })
    .on('cycle', function(event) {
      console.log(event.target.toString());
    });
}

module.exports = { options, benchmark, wrapRunner };
