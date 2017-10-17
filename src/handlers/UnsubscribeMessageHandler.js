const FROM_ADDRESS_REGEXP = /<(.+)>/gi;


class UnsubscribeMessageHandler {
  constructor (mailbox, mailingListDatabase, logger) {
    this.mailbox = mailbox;
    this.mailingListDatabase = mailingListDatabase;
    this.logger = logger;
  }

  async processMessage (message) {
    const from = this._extractFromAddress(message);

    await this.mailingListDatabase.unsubscribeAddress(from);
    await this.mailbox.deleteMessage(message.id);
    return true;
  }

  _extractFromAddress (message) {
    const from = message.headers.get('from').text;
    const match = FROM_ADDRESS_REGEXP.exec(from);
    return match && match[1];
  }
}

module.exports = UnsubscribeMessageHandler;
