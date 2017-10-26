class HumanMessageHandler {
  constructor (logger) {
    this.logger = logger;
  }

  processMessage (message) {
    this.logger.debug(
      `Stub: do something with human message (from ${message.headers.get('from').text})`
    );
    return {
      reason: 'Human message',
      skipped: true
    };
  }
}

module.exports = HumanMessageHandler;
