// @flow

function wrapInPromise<Output>(f: (...args: Array<any>) => Promise<Output> | Output): (...args: Array<any>) => Promise<Output> {
  return (...args: Array<any>) => {
    try {
      return Promise.resolve(f(...args));
    }
    catch (error) {
      return Promise.reject(error);
    }
  };
}

function delay(time: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

module.exports = {
  delay,
  wrapInPromise
};
