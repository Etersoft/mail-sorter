require('./src/runCli')(class {
  constructor (_, logger) {
    this.logger = logger;
  }

  disableEmailsForAddress (address) {
    this.logger.debug(`Disabling address ${address} in mailing DB`);
    return true;
  }
});
