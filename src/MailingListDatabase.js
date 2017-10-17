class MailingListDatabase {
  constructor (logger) {
    this.logger = logger;
  }

  setAddressStatus (address, status, metadata) {
    this.logger.verbose(`${address}: set status = ${status}`);
  }
}

module.exports = MailingListDatabase;
