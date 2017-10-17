class AutoresponderMessageHandler {
  constructor (mailbox, logger) {
    this.mailbox = mailbox;
    this.logger = logger;
  }

  async processMessage (message) {
    await this.mailbox.deleteMessage(message.id);
    // Do not mark as read
    return false;
  }
}

module.exports = AutoresponderMessageHandler;
