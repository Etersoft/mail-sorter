class MailServerMessageHandler {
  constructor (storage) {
    this.storage = storage;
  }

  async processMessage (message) {
    const mailServerReply = this.extract
    await this.storage.save(mailServerReply);
    await message.markAsRead();
  }

  _extractMailServerReply (message) {
    return message;
  }
}

module.exports = MailServerMessageHandler;
