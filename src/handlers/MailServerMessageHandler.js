const ReplyStatuses = {
  INVALID_ADDRESS: 1,
  TEMPORARY_FAILURE: 2
};


class MailServerMessageHandler {
  constructor (userDatabase, mailbox, logger) {
    this.userDatabase = userDatabase;
    this.mailbox = mailbox;
    this.handledAddresses = new Map();
    this.logger = logger;
  }

  async processMessage (message) {
    const checks = [
      this._tryWithDsnInfo,
      this._tryWithXMailerDaemonError
    ].map(check => check.bind(this));

    for (const check of checks) {
      const result = await check(message);
      if (result) {
        return result;
      }
    }

    return {
      reason: 'Failed to parse and extract failure reason',
      skipped: true
    };
  }

  _convertDsnStatus (status) {
    return status[0] === '5' ? ReplyStatuses.INVALID_ADDRESS : ReplyStatuses.TEMPORARY_FAILURE;
  }

  _convertXMailerDaemonErrorStatus (status) {
    return {
      user_not_found: ReplyStatuses.INVALID_ADDRESS
    }[status];
  }

  async _excludeImmediatelyIfNotAlready (recipient, status, message, fullStatus) {
    return await this.userDatabase.setAddressStatus(recipient, status, fullStatus);
  }

  _extractDeliveryStatusNotification (message) {
    const dsns = message.attachments.filter(attachment => {
      return attachment.contentType === 'message/delivery-status';
    });
    if (!dsns.length) {
      return null;
    }

    const dsnString = dsns[0].content.toString('utf8');
    const headers = this._extractDsnHeaders(dsnString);
    const originalRecipient = headers.get('original-recipient');
    if (!originalRecipient) {
      return null;
    }

    return {
      recipient: this._extractOriginalRecipientAddress(originalRecipient),
      status: headers.get('status')
    };
  }

  _extractDsnHeaders (dsnString) {
    const lines = dsnString.split('\n').filter(line => line.trim().length);
    const headers = new Map();
    lines.map(line =>
      line.split(':').map(part => part.trim())
    ).filter(tuple => tuple.length === 2).forEach(headerTuple => {
      headers.set(headerTuple[0].toLowerCase(), headerTuple[1]);
    });
    return headers;
  }

  _extractOriginalRecipientAddress (headerString) {
    const tuple = headerString.split(';').map(part => part.trim());
    return tuple[1] || null;
  }

  async _tryWithDsnInfo (message) {
    const dsnInfo = this._extractDeliveryStatusNotification(message);

    if (!dsnInfo) {
      return false;
    }

    const status = this._convertDsnStatus(dsnInfo.status);
    return await this._excludeImmediatelyIfNotAlready(
      dsnInfo.recipient, status, message, dsnInfo.status
    );
  }

  async _tryWithXMailerDaemonError (message) {
    const hasXMailerDaemonError = message.headers.has('x-mailer-daemon-error');

    if (!hasXMailerDaemonError &&
        !message.headers.has('x-failed-recipients')) {
      return false;
    }

    if (!message.headers.has('x-mailer-daemon-recipients') &&
        !message.headers.has('x-failed-recipients')) {
      return false;
    }

    const status = hasXMailerDaemonError ? this._convertXMailerDaemonErrorStatus(
      message.headers.get('x-mailer-daemon-error')
    ) : ReplyStatuses.INVALID_ADDRESS;
    const recipient = message.headers.get('x-mailer-daemon-recipients') || 
                      message.headers.get('x-failed-recipients');
    return await this._excludeImmediatelyIfNotAlready(
      recipient, status, message, 'not set'
    );
  }
}

MailServerMessageHandler.ReplyStatuses = ReplyStatuses;

module.exports = MailServerMessageHandler;
