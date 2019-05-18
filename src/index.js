const functional = require('./functional');
const { delay } = require('./shared/utils');

module.exports = {
  ...functional,
  functional,
  delay
};
