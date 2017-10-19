const { extractFromAddress } = require('../utils');


class UnsubscribeMessageHandler {
  constructor (mailbox, mailingListDatabase, logger) {
    this.mailbox = mailbox;
    this.mailingListDatabase = mailingListDatabase;
    this.logger = logger;
  }

  async processMessage (message) {
    const from = extractFromAddress(message);

    await this.mailingListDatabase.unsubscribeAddress(from);
    await this.mailbox.deleteMessage(message.id);
    return true;
  }
}

module.exports = UnsubscribeMessageHandler;
