const { chunk } = require('lodash');

const MailboxSorter = require('./MailboxSorter');


const FAILED_MESSAGES_PER_LINE = 10;

class MailboxSorterStatsCollector {
  constructor (sorter, typesNameMap, logger) {
    this.sorter = sorter;
    this.logger = logger;
    this.typesNameMap = typesNameMap;
    this.reset();
    this._initEventHandlers();
  }

  logStats () {
    this.logger.info('Class distribution:');
    Array.from(this.stats.classDistribution.entries()).forEach(([type, count]) => {
      this.logger.info(`  ${this.typesNameMap[type]}: ${count}`);
    });

    this.logger.info(`Failed messages count: ${this.stats.counters.failed}`);
    this.logger.info(`Messages with performed actions: ${this.stats.counters.actionsPerformed}`);
    this.logger.info(`Successful messages count: ${this.stats.counters.successful}`);
    if (this.stats.failedMessages.length) {
      this.logger.info('Failed messages list:');
      const messageIdsWithQuotes = this.stats.failedMessages.map((id, index) => {
        return (index === this.stats.failedMessages.length - 1) ? id : id + ', ';
      });
      chunk(messageIdsWithQuotes, FAILED_MESSAGES_PER_LINE).forEach(messageIds => {
        this.logger.info(messageIds.join(''));
      });
    }
  }

  reset () {
    this.stats = {
      classDistribution: new Map(),
      counters: {
        actionsPerformed: 0,
        failed: 0,
        successful: 0
      },
      failedMessages: []
    };
  }

  _handleFailedMessage (message) {
    this._incrementCounter('failed')();
    this.stats.failedMessages.push(message.id);
  }

  _incrementCounter (counterName) {
    return () => {
      this.stats.counters[counterName]++;
    };
  }

  _initEventHandlers () {
    const listen = (event, method) => {
      this.sorter.on(event, method.bind(this));
    };
    listen(MailboxSorter.Events.MESSAGE_CLASSIFIED, this._updateClassDistribution);
    listen(MailboxSorter.Events.MESSAGE_PROCESSED, this._incrementCounter('successful'));
    listen(
      MailboxSorter.Events.MESSAGE_ACTIONS_PERFORMED,
      this._incrementCounter('actionsPerformed')
    );
    listen(MailboxSorter.Events.MESSAGE_ERROR, this._handleFailedMessage);
  }

  _updateClassDistribution (message, messageType) {
    this.stats.classDistribution.set(messageType, 
      (this.stats.classDistribution.get(messageType) || 0) + 1
    );
  }
}

module.exports = MailboxSorterStatsCollector;
