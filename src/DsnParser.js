const FailureTypes = require('./FailureTypes');
const { unwrapFrom } = require('./utils');


/**
 * Класс, который отвечает за извлечение данных из стандартных уведомлений
 * почтовых серверов (DSN)
 */
class DsnParser {
  constructor (logger) {
    this.logger = logger;
  }

  async extract (message) {
    const dsnString = this._extractDsn(message);
    if (!dsnString) {
      this.logger.debug(`UID ${message.uid}: no DSN attachment found`);
      return null;
    }

    const headers = this._extractDsnHeaders(dsnString);
    const originalRecipient = headers.get('original-recipient');
    if (!originalRecipient) {
      this.logger.debug(`UID ${message.uid}: missing original-recipient header`);
      return null;
    }
    const status = headers.get('status');
    const recipient = this._extractOriginalRecipientAddress(originalRecipient);

    return {
      comment: `DSN status = ${status}`,
      dsnStatus: status,
      listId: await this._extractListId(message),
      message,
      recipient,
      status: this._convertDsnStatus(status)
    };
  }


  _convertDsnStatus (status) {
    return status.charAt(0) === '5' ? FailureTypes.INVALID_ADDRESS : FailureTypes.TEMPORARY_FAILURE;
  }

  _extractDsn (message) {
    const dsns = message.attachments.filter(attachment => {
      return attachment.contentType === 'message/delivery-status';
    });
    if (!dsns.length) {
      return null;
    }

    return dsns[0].content.toString('utf8');
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

  async _extractListId (message) {
    const originalMessage = await message.getAdditionalAttachment();
    if (!originalMessage) {
      this.logger.debug(
        `UID ${message.uid}: Failed to extract original message, can't collect mailing stats`
      );
      return null;
    }

    let listId = originalMessage.headers.get('list');
    // because mailparser transforms headers
    if (listId && listId.id && listId.id.name) {
      listId = listId.id.name;
    } else {
      this.logger.debug(`UID ${message.uid}: no list-id`);
      return null;
    }
  }

  _extractOriginalRecipientAddress (headerString) {
    const tuple = headerString.split(';').map(part => part.trim());
    return tuple[1] ? unwrapFrom(tuple[1]) : null;
  }
}

module.exports = DsnParser;
