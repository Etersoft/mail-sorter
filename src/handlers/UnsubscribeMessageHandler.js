class UnsubscribeMessageHandler {
  constructor (mailbox, mailingListDatabase, logger) {
    this.mailbox = mailbox;
    this.mailingListDatabase = mailingListDatabase;
    this.logger = logger;
  }

  async processMessage (message) {
    const found = await this.mailingListDatabase.unsubscribeAddress(message.fromAddress);
    if (found) {
      return {
        performedActions: ['unsubscribe'],
        reason: 'Received unsubscribe email',
        skipped: false
      };
    }

    return {
      performedActions: [],
      reason: 'Received unsubscribe email, but found no address in database',
      skipped: false
    };
  }
}

module.exports = UnsubscribeMessageHandler;
