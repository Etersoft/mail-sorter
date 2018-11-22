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
    let originalRecipient = headers.get('original-recipient');
    if (!originalRecipient) {
      this.logger.debug(`UID ${message.uid}: missing original-recipient header`);

      const finalRecipient = headers.get('final-recipient');
      if (!finalRecipient) {
        this.logger.debug(`UID ${message.uid}: final-recipient is missing too`);
        return null;
      }
      originalRecipient = finalRecipient;
    }
    const status = headers.get('status');
    const diagnosticCode = headers.get('diagnostic-code');
    const recipient = this._extractOriginalRecipientAddress(originalRecipient);
    let comment = `DSN status = ${status}`;
    if (diagnosticCode) {
      comment += ', Diagnostic-Code = ' + diagnosticCode;
    }

    return {
      comment,
      diagnosticCode,
      dsnStatus: status,
      listId: await this._extractListId(message),
      message,
      recipient,
      spam: Boolean(diagnosticCode && diagnosticCode.indexOf('spam message') !== -1),
      status: this._convertDsnStatus(status)
    };
  }


  _convertDsnStatus (status) {
    if (!status) {
      return undefined;
    }
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

    let lastHeader = null;
    for (const line of lines) {
      if (line[0] === ' ' || line[0] === '\t') {
        if (!lastHeader) {
          throw new Error('Invalid syntax: ' + line);
        } else {
          headers.set(lastHeader, headers.get(lastHeader) + ' ' + line.trim());
        }
      } else {
        let [name, ...rest] = line.split(':');
        const value = rest.join(':').trim();
        name = name.trim().toLowerCase();
        headers.set(name, value);
        lastHeader = name;
      }
    }

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
    if (listId && listId.id) {
      listId = listId.id;
      return [
        listId.name,
        listId.mail ? `<${listId.mail}>` : null
      ].filter(part => typeof part === 'string').join(' ');
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
