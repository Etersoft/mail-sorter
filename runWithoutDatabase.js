require('./src/runCli')(class {
  constructor (_, logger) {
    this.logger = logger;
  }

  disableAddressEmails (address, status, fullStatus) {
    this.logger.debug(`Disabling address ${address} in DB`);
  }
});
