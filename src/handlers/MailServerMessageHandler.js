const { unwrapFrom } = require('../utils');

const ReplyStatuses = {
  INVALID_ADDRESS: 1,
  TEMPORARY_FAILURE: 2
};


class MailServerMessageHandler {
  constructor (
    userDatabase, logger, mailingRepository, addressStatsRepository, config
  ) {
    this.userDatabase = userDatabase;
    this.handledAddresses = new Map();
    this.logger = logger;
    this.mailingRepository = mailingRepository;
    this.addressStatsRepository = addressStatsRepository;
    this.maxTemporaryFailures = config.maxTemporaryFailures;
    this.listIdToMailingId = new Map();
  }

  /**
   * Порядок обработки ответов почтовых серверов:
   * 1. Извлечь информацию о DSN: адрес получателя, статус (тип ошибки)
   * и (опционально) list-id. Пробуем сначала извлечь стандартный DSN, потом
   * пробуем нестандартные заголовки (x-mailer-daemon-error)
   * 2. Если удалось получить list-id, то ищем рассылку по list-id и увеличиваем
   * счётчик ошибок доставки.
   * 3. Изменить статистику для конкретного адреса. Если ошибка постоянная (5.*),
   * то просто выставляется последний статус и его дата. Если же ошибка временная,
   * то дополнительно счётчик временных ошибок увеличивается на 1.
   * 4. Если ошибка постоянная или превышено пороговое значение,
   * то адрес исключается из базы рассылок.
   */
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
    return tuple[1] ? unwrapFrom(tuple[1]) : null;
  }

  async _getMailingIdByListId (listId) {
    if (this.listIdToMailingId.has(listId)) {
      return this.listIdToMailingId.get(listId);
    }
    const mailing = await this.mailingRepository.getByListId(listId);
    if (mailing) {
      this.listIdToMailingId.set(listId, mailing.id);
      return mailing.id;
    }
    return null;
  }

  async _performActions (recipient, statusClassification, message, dsnStatus) {
    let stats;
    if (this.addressStatsRepository) {
      stats = await this.addressStatsRepository.updateInTransaction(
        recipient, // find stats by this email
        async stats => { // if found, this will be executed as update transaction
          stats.lastStatus = dsnStatus;
          stats.lastStatusDate = new Date();
          if (statusClassification === ReplyStatuses.TEMPORARY_FAILURE) {
            stats.temporaryFailureCount++;
          }
        }
      );
      if (stats) {
        this.logger.debug(`${recipient}: updated stats`);
      }
    }

    if (statusClassification === ReplyStatuses.INVALID_ADDRESS ||
       (stats && stats.temporaryFailureCount > this.maxTemporaryFailures)) {
      
      const result = await this.userDatabase.disableAddressEmails(recipient);
      if (result) {
        return result;
      }
      return {
        performedActions: ['disable emails'],
        reason: `Invalid address (${recipient}, status ${dsnStatus})`,
        skipped: false
      };
    } else if (statusClassification === ReplyStatuses.TEMPORARY_FAILURE) {
      return {
        reason: `Temporary delivery failure (${recipient}, status ${dsnStatus})`,
        skipped: true
      };
    }
  }

  async _tryWithDsnInfo (message) {
    const dsnInfo = this._extractDeliveryStatusNotification(message);

    if (!dsnInfo) {
      this.logger.debug(`UID ${message.uid}: no dsn info`);
      return false;
    }

    await this._updateMailingCounters(message);

    const status = this._convertDsnStatus(dsnInfo.status);
    return await this._performActions(
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
    return await this._performActions(
      recipient, status, message, '<unknown>'
    );
  }

  async _updateMailingCounters (message) {
    const originalMessage = await message.getAdditionalAttachment();
    if (!this.mailingRepository) {
      return;
    }
    if (!originalMessage) {
      this.logger.debug(`UID ${message.uid}: Failed to extract original message, can't collect mailing stats`);
      return;
    }

    let listId = originalMessage.headers.get('list');
    // because mailparser transforms headers
    if (listId && listId.id && listId.id.name) {
      listId = listId.id.name;
    } else {
      this.logger.debug(`UID ${message.uid}: no list-id`);
      return;
    }

    this.logger.debug(`UID ${message.uid}: list-id ${listId}`);
    const mailingId = await this._getMailingIdByListId(listId);
    if (!mailingId) {
      this.logger.debug(`UID ${message.uid}: no mailing with list-id ${listId}`);
      return;
    }
    
    const mailing = await this.mailingRepository.updateInTransaction(
      mailingId,
      async mailing => {
        mailing.undeliveredCount++;
      }
    );
    this.logger.debug(
      `UID ${message.uid}: mailing #${mailingId} undeliveredCount = ${
        mailing.undeliveredCount
      }`
    );
  }
}

MailServerMessageHandler.ReplyStatuses = ReplyStatuses;

module.exports = MailServerMessageHandler;
