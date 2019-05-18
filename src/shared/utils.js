function wrapInPromise(f) {
  return (...args) => {
    try {
      return Promise.resolve(f(...args));
    } catch (error) {
      return Promise.reject(error);
    }
  };
}

function delay(time) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

module.exports = {
  delay,
  wrapInPromise
};
