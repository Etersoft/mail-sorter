class UnsubscribeMessageHandler {
  constructor (mailbox, mailingListDatabase, logger) {
    this.mailbox = mailbox;
    this.mailingListDatabase = mailingListDatabase;
    this.logger = logger;
  }

  async processMessage (message) {
    await this.mailingListDatabase.unsubscribeAddress(message.fromAddress);
    return true;
  }
}

module.exports = UnsubscribeMessageHandler;
