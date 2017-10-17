const Mailbox = require('./Mailbox');


class ReadonlyMailbox extends Mailbox {
  constructor (options) {
    super(Object.assign({}, options, {
      readonly: true
    }));
  }

  deleteMessage (messageId) {
    // Stub
    return Promise.resolve();
  }

  markAsRead (messageId) {
    // Stub
    return Promise.resolve();
  }
}

module.exports = ReadonlyMailbox;
