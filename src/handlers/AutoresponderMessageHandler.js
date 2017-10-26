class AutoresponderMessageHandler {
  constructor (mailbox, logger) {
    this.mailbox = mailbox;
    this.logger = logger;
  }

  async processMessage (message) {
    await this.mailbox.deleteMessage(message);
    this.logger.debug(`Autoresponder message (${message.fromAddress}): delete`);
    return {
      performedActions: ['delete'],
      reason: 'Autoresponder message',
      skipped: false
    };
  }
}

module.exports = AutoresponderMessageHandler;
