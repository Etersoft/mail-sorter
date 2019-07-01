const { EventEmitter } = require('events');

const MessageTypes = require('./MessageTypes');


const Events = {
  MESSAGE_CLASSIFIED: 1,
  MESSAGE_PROCESSED: 2,
  MESSAGE_ACTIONS_PERFORMED: 3,
  MESSAGE_ERROR: 4
};

class MailboxSorter extends EventEmitter {
  constructor (mailbox, classifier, logger, actionLogger, options) {
    super();
    this.mailbox = mailbox;
    this.classifier = classifier;
    this.messageBatchSize = options.messageBatchSize;
    this.handlerMap = options.handlerMap;
    this.actions = options.actions || {};
    this.actionsPerType = options.actionsPerType || {};
    this.logger = logger;
    this.actionLogger = actionLogger;

    if (!Number.isInteger(this.messageBatchSize) || this.messageBatchSize < 1) {
      throw new Error('Invalid messageBatchSize value: ' + this.messageBatchSize);
    }
  }

  async sort () {
    this.logger.debug('Fetching list of unread messages...');
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
      this.logger.debug('Processed message batch #' + (batchCount - i));
    }
  }

  _getActions (type) {
    return Object.assign({}, this.actions, this.actionsPerType[type]);
  }

  async _performActionsAndLogResult (message, result) {
    const messageInfo = `UID ${message.uid} (from ${message.fromAddress})`;
    if (result && !result.skipped) {
      let performedActions = await this._performPostProcessActions(message);
      if (result.performedActions) {
        performedActions = performedActions.concat(result.performedActions);
      }
      const actionString = performedActions.join(', ');
      const reasonString = result.reason || 'unknown';

      const logMessage = `Message ${messageInfo} actions: ${actionString}; reason: ${reasonString}`;
      this.logger.verbose(logMessage);
      if (this.actionLogger) {
        this.actionLogger.info(logMessage);
      }
    } else {
      const reasonString = result.reason || 'unknown';
      this.logger.verbose(
        `Message ${messageInfo} skipped, no actions performed, reason: ${reasonString}`
      );
    }
  }

  async _performPostProcessActions (message) {
    const actionsPerformed = [];
    const actions = this._getActions(message.type);
    if (actions.markAsRead) {
      // Pass UID instead of seq no, because some servers do not work correctly
      // with seq numbers
      await this.mailbox.markAsRead(message.uid);
      actionsPerformed.push('mark as read');
    }
    if (actions.delete) {
      await this.mailbox.deleteMessage(message.uid);
      actionsPerformed.push('delete message');
    }

    this.emit(Events.MESSAGE_ACTIONS_PERFORMED, message);
    return actionsPerformed;
  }

  _processMessageBatch (ids) {
    return new Promise((resolve, reject) => {
      let processedCount = 0;
      const onMessage = async message => {
        try {
          await this._processMessage(message);
        } catch (error) {
          this.emit(Events.MESSAGE_ERROR, message, error);
          this.logger.warn(`Warning: message #${message.id} failed: ${error.stack}`);
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
    message.type = messageType;
    this.emit(Events.MESSAGE_CLASSIFIED, message, messageType);
    const actions = this._getActions(messageType);
    const handler = this.handlerMap[messageType];
    this.logger.debug(`Message #${message.id} classified as ${MessageTypes.names[messageType]}`);

    if (!actions.callHandler) {
      this.logger.debug(`Do not calling handler according to settings (#${message.id})`);
      this.emit(Events.MESSAGE_PROCESSED, message);
      return;
    }

    if (handler) {
      const result = await handler.processMessage(message);
      await this._performActionsAndLogResult(message, result);
      this.emit(Events.MESSAGE_PROCESSED, message);
    } else {
      throw new Error(
        `Message #${message.id}: no action for this type ${MessageTypes.names[messageType]}`
      );
    }
  }
}

MailboxSorter.Events = Events;

module.exports = MailboxSorter;
