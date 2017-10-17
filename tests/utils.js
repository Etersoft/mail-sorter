const sinon = require('sinon');
const winston = require('winston');


module.exports = {
  createFakeLogger () {
    const logger = {};
    Object.keys(winston.config.npm.levels).forEach(level => {
      logger[level] = sinon.spy();
    });
    return logger;
  },
  sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};
