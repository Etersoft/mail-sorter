const { mock } = require('node:test');


function createFakeLogger () {
  const levels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
  const logger = {};
  for (const level of levels) {
    logger[level] = mock.fn();
  }
  return logger;
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { createFakeLogger, sleep };