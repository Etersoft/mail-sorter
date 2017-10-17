const MessageTypes = require('./MessageTypes');


class MailboxSorter {
  constructor (mailbox, classifier, logger, options) {
    this.mailbox = mailbox;
    this.classifier = classifier;
    this.messageBatchSize = options.messageBatchSize;
    this.handlerMap = options.handlerMap;
    this.logger = logger;

    if (!Number.isInteger(this.messageBatchSize) || this.messageBatchSize < 1) {
      throw new Error('Invalid messageBatchSize value: ' + this.messageBatchSize);
    }
  }

  async sort () {
    this.logger.info(`Fetching list of unread messages...`);
    const unseenIds = await this.mailbox.findUnseen();
    this.logger.info(`Found ${unseenIds.length} unread messages, processing...`);
    const batchCount = Math.ceil(unseenIds.length / this.messageBatchSize);
    if (batchCount === 0) {
      return;
    }

    // Load N messages, process them all and only after that
    // load next N. This is made to avoid loading all messages
    // at once because that may lead to high memory consumption
    for (let i = batchCount; i--; ) {
      const rangeStart = i * this.messageBatchSize;
      const rangeEnd = rangeStart + this.messageBatchSize;
      const ids = unseenIds.slice(rangeStart, rangeEnd);
      await this._processMessageBatch(ids);
    }
  }

  _processMessageBatch (ids) {
    return new Promise((resolve, reject) => {
      let processedCount = 0;
      const onMessage = async message => {
        try {
          await this._processMessage(message);
        } catch (error) {
          this.logger.warn(`Warning: message #${message.id} failed: ${error}`);
        }
        processedCount++;
        if (processedCount === ids.length) {
          resolve();
        }
      };

      this.mailbox.loadMessages(
        ids, onMessage, reject
      );
    });
  }

  async _processMessage (message) {
    const messageType = this.classifier.classifyMessage(message);
    const handler = this.handlerMap[messageType];
    this.logger.debug(`Message #${message.id} classified as ${MessageTypes.names[messageType]}`);
    if (handler) {
      let markAsRead = false;
      markAsRead = await handler.processMessage(message);
      if (markAsRead) {
        await this.mailbox.markAsRead(message.id);
      }
    } else {
      this.logger.warn(`Message #${message.id}: no action for this type`);
    }
  }
}

module.exports = MailboxSorter;
