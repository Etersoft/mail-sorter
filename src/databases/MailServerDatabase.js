class MailServerDatabase {
  constructor (config, logger) {
    this.logger = logger;
    this.backend = config.backend;
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
    return this._disableEmailsForAddress(address);
  }

  async unsubscribeAddress (address) {
    this.logger.debug('Unsubscribe emails: ' + address);
    if (this.readonly) {
      return true;
    }
    return this._disableEmailsForAddress(address);
  }

  // Удаляет адрес из всех рассылок mail-server (POST /mailings/unsubscribe).
  // Ответ: { success: true, data: { removed: <число рассылок> } }
  async _disableEmailsForAddress (address) {
    const response = await fetch(`${this.backend}/mailings/unsubscribe`, {
      body: JSON.stringify({ email: address }),
      headers: { 'Content-Type': 'application/json' },
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
