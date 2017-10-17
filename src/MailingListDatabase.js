class MailingListDatabase {
  constructor (logger) {
    this.logger = logger;
  }

  setAddressStatus (address, status) {
    this.logger.verbose(`${address}: set status = ${status}`);
    return true;
  }

  unsubscribeAddress (address) {
    this.logger.verbose(`unsubscribe ${address}`);
    return true;
  }
}

module.exports = MailingListDatabase;
