const Benchmark = require('benchmark');

function wrapRunner(benchmarkPromise) {
  return (deferred) => {
    benchmarkPromise()
      .then((value) => {
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
  return suite
    .on('error', function(event){
      console.log('error', event.target.error);
    })
    .on('cycle', function(event){
      console.log(event.target.toString());
    });
}

module.exports = { options, benchmark, wrapRunner };
