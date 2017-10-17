class HumanMessageHandler {
  constructor (logger) {
    this.logger = logger;
  }

  processMessage (message) {
    this.logger.info(`Stub: do something with human message (from ${message.headers.get('from').text})`);
  }
}

module.exports = HumanMessageHandler;
