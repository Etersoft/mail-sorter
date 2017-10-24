class MailingListDatabase {
  constructor (logger) {
    this.logger = logger;
    this.failedAddresses = new Set();
    this.unsubscribedAddresses = new Set();
  }

  setAddressStatus (address, status) {
    this.logger.verbose(`${address}: set status = ${status}`);
    this.failedAddresses.add(address);
    return true;
  }

  unsubscribeAddress (address) {
    this.logger.verbose(`unsubscribe ${address}`);
    this.unsubscribedAddresses.add(address);
    return true;
  }
}

module.exports = MailingListDatabase;
