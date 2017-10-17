class AutoresponderMessageHandler {
  constructor (mailbox, logger) {
    this.mailbox = mailbox;
    this.logger = logger;
  }

  async processMessage (message) {
    await this.mailbox.deleteMessage(message.id);
    return true;
  }
}

module.exports = AutoresponderMessageHandler;
