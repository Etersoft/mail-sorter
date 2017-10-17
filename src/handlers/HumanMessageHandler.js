class HumanMessageHandler {
  constructor (logger) {
    this.logger = logger;
  }

  processMessage (message) {
    this.logger.info('Stub: do something with human message');
  }
}

module.exports = HumanMessageHandler;
