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

  disableEmailsForAddress (address, status, fullStatus) {
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
    const result = {
      performedActions: ['unsubscribe'],
      reason: `Unsubscribe email received`,
      skipped: false
    };
    if (this.readonly) {
      return Promise.resolve(result);
    }
    return this._disableEmailsForAddress(address).then(queryResult => {
      if (!queryResult.affectedRows) {
        return {
          reason: `Email not found in database (${address})`,
          skipped: true
        };
      }
      return result;
    });
  }

  _disableEmailsForAddress (address) {
    return axios.post(`${this.backend}/mailings/${mailingId}/unsubscribe`);
  }
}

module.exports = MailServerDatabase;
