class MailServerDatabase {
  constructor (config, logger) {
    this.logger = logger;
    this.backend = config.backend;
    this.apiKey = config.apiKey;
    this.readonly = config.readonly;
    if (config.readonly) {
      logger.info('Dry run: will not unsubscribe anyone');
    }
  }

  async disableEmailsForAddress (address) {
    this.logger.debug('Disable emails: ' + address);
    if (this.readonly) {
      return true;
    }
    return this._disableEmailsForAddress(address, false);
  }

  // Письмо на адрес из List-Unsubscribe — отписка только от рассылок с этим заголовком
  async unsubscribeAddress (address) {
    this.logger.debug('Unsubscribe emails: ' + address);
    if (this.readonly) {
      return true;
    }
    return this._disableEmailsForAddress(address, true);
  }

  // Удаляет адрес из рассылок mail-server (POST /mailings/unsubscribe).
  // Ответ: { success: true, data: { removed: <число рассылок> } }
  async _disableEmailsForAddress (address, listUnsubscribe) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    const response = await fetch(`${this.backend}/mailings/unsubscribe`, {
      body: JSON.stringify({ email: address, ...(listUnsubscribe ? { listUnsubscribe } : {}) }),
      headers,
      method: 'POST'
    });
    if (!response.ok) {
      throw new Error(`mail-server returned ${response.status}: ${await response.text()}`);
    }
    const result = await response.json();
    return Boolean(result.data && result.data.removed);
  }
}

module.exports = MailServerDatabase;
