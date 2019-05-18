function wrapInPromise(f) {
  return (...args) => {
    try {
      return Promise.resolve(f(...args));
    } catch (error) {
      return Promise.reject(error);
    }
  };
}

module.exports = wrapInPromise;
