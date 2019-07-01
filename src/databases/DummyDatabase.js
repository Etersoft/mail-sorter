class DummyDatabase {
  constructor (_, logger) {
    this.logger = logger;
  }

  disableEmailsForAddress (address) {
    this.logger.debug(`DummyDatabase: disabling address ${address} in mailing DB`);
    return true;
  }

  unsubscribeAddress (address) {
    this.logger.debug(`DummyDatabase: unsubscribing address ${address} in mailing DB`);
    return true;
  }
}

module.exports = DummyDatabase;
