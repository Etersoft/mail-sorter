class UnsubscribeMessageHandler {
  constructor (mailbox, mailingListDatabase, logger) {
    this.mailbox = mailbox;
    this.mailingListDatabase = mailingListDatabase;
    this.logger = logger;
  }

  async processMessage (message) {
    await this.mailingListDatabase.unsubscribeAddress(message.fromAddress);
    return {
      performedActions: ['unsubscribe (set mailagreed = 0)'],
      reason: 'Received unsubscribe email',
      skipped: false
    };
  }
}

module.exports = UnsubscribeMessageHandler;
