const axios = require('axios');


class MailServerDatabase {
  constructor (config, logger) {
    this.logger = logger;
    this.backend = config.backend;
    this.readonly = config.readonly;
    if (config.readonly) {
      logger.info('Dry run: will not unsubscribe anyone');
    }
  }

  disableEmailsForAddress (address) {
    this.logger.debug('Disable emails: ' + address);
    if (this.readonly) {
      return Promise.resolve(true);
    }
    return this._disableEmailsForAddress(address).then(queryResult => {
      return Boolean(queryResult.affectedRows);
    });
  }

  unsubscribeAddress (address) {
    this.logger.debug('Unsubscribe emails: ' + address);
    if (this.readonly) {
      return Promise.resolve(true);
    }
    return this._disableEmailsForAddress(address).then(queryResult => {
      return Boolean(queryResult.affectedRows);
    });
  }

  _disableEmailsForAddress (address) {
    return axios.post(`${this.backend}/mailings/${mailingId}/unsubscribe`, {
      email: address,
      skipCodeCheck: true
    });
  }
}

module.exports = MailServerDatabase;
