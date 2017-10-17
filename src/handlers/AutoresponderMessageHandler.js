class AutoresponderMessageHandler {
  constructor (logger) {
    this.logger = logger;
  }

  processMessage (message) {
    this.logger.info(`Stub: do something with autoresponder message (from ${message.headers.get('from').text})`);
  }
}

module.exports = AutoresponderMessageHandler;
