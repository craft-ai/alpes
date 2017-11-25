// @flow

function wrapInPromise<Output>(f: (...args: Array<any>) => Promise<Output> | Output): (...args: Array<any>) => Promise<Output> {
  return (...args: Array<any>) => {
    try {
      const result = f(...args);
      if (result instanceof Promise) {
        return result;
      }
      else {
        return Promise.resolve(result);
      }
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
