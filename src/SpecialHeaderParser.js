const FailureTypes = require('./FailureTypes');


/**
 * Класс, отвечающий за извлечение данных из нестандартных уведомлений
 * почтовых серверов, где данные об ошибке доставки указаны
 * в нестандартных заголовках.
 * Такие письма "любит" присылать, прежде всего, mail.ru.
 */
class SpecialHeaderParser {
  constructor (logger) {
    this.logger = logger;
  }

  extract (message) {
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
    ) : FailureTypes.INVALID_ADDRESS;
    const recipient = message.headers.get('x-mailer-daemon-recipients') || 
                      message.headers.get('x-failed-recipients');
    if (!recipient) {
      return null;
    }

    return {
      comment: hasXMailerDaemonError ?
        `X-Mailer-Daemon-Error = ${message.headers.get('x-mailer-daemon-error')}` :
        'X-Failed-Recipients is set',
      dsnStatus: '<unknown>',
      listId: null,
      message,
      recipient,
      status
    };
  }

  _convertXMailerDaemonErrorStatus (status) {
    const type = {
      user_not_found: FailureTypes.INVALID_ADDRESS
    }[status];
    if (!type) {
      this.logger.warn(`Unknown value for X-Mailer-Daemon-Error: ${status}`);
    }
    return type;
  }
}

module.exports = SpecialHeaderParser;
