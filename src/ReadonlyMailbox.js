const Mailbox = require('./Mailbox');


class ReadonlyMailbox extends Mailbox {
  constructor (options) {
    super(Object.assign({}, options, {
      readonly: true
    }));
  }

  deleteMessage () {
    // Stub
    return Promise.resolve();
  }

  markAsRead () {
    // Stub
    return Promise.resolve();
  }
}

module.exports = ReadonlyMailbox;
