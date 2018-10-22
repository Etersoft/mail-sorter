const FailureTypes = require('../FailureTypes');


class MailServerMessageHandler {
  constructor (
    userDatabase, statsTracker, failureInfoParser, config
  ) {
    this.userDatabase = userDatabase;
    this.statsTracker = statsTracker;
    this.failureInfoParser = failureInfoParser;
    this.maxTemporaryFailures = config.maxTemporaryFailures;
    this.readonly = config.readonly;
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
    const failureInfo = await this.failureInfoParser.extractFailureInfo(message);
    if (!failureInfo) {
      return {
        reason: 'Failed to parse and extract failure reason',
        skipped: true
      };
    }

    const statsActions = this.readonly ? [] : await this.statsTracker.countFailure(failureInfo);

    if (failureInfo.spam) {
      return {
        performedActions: statsActions,
        reason: `Received mail server reply (DSN) about spam. Info: ${failureInfo.comment
        }. Address: ${failureInfo.recipient}`,
        skipped: false
      };
    }

    return await this._performAction(failureInfo, [...statsActions]);
  }

  async _exceedsTemporaryFailureLimit (failureInfo) {
    const temporaryFailureCount = await this.statsTracker.getTemporaryFailureCount(
      failureInfo.recipient
    );
    return (temporaryFailureCount > this.maxTemporaryFailures) && (this.maxTemporaryFailures > 0);
  }

  async _performAction (failureInfo, statsActions) {
    if (await this._shouldExclude(failureInfo)) {
      const excluded = await this.userDatabase.disableEmailsForAddress(failureInfo.recipient);
      if (excluded) {
        statsActions.push('disabled emails (excluded from mailing database)');
      }
      return {
        performedActions: statsActions,
        reason: `Received mail server reply (DSN). Info: ${failureInfo.comment
        }. Address: ${failureInfo.recipient}`,
        skipped: false
      };
    } else {
      return {
        performedActions: statsActions,
        reason: `Received mail server reply (DSN) with temporary failure. Info: ${
          failureInfo.comment}. Address: ${failureInfo.recipient}`,
        skipped: false
      };
    }
  }

  async _shouldExclude (failureInfo) {
    return (failureInfo.status === FailureTypes.INVALID_ADDRESS) || (
      failureInfo.status === FailureTypes.TEMPORARY_FAILURE &&
      (await this._exceedsTemporaryFailureLimit(failureInfo))
    );
  }
}

MailServerMessageHandler.ReplyStatuses = FailureTypes;

module.exports = MailServerMessageHandler;
