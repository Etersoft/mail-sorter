const MessageTypes = require('./MessageTypes');


class MailboxSorter {
  constructor (mailbox, classifier, handlerMap, batchSize) {
    this.mailbox = mailbox;
    this.classifier = classifier;
    this.handlerMap = handlerMap;
    this.batchSize = batchSize;
  }

  async sort () {
    console.log(`Fetching list of unread messages...`);
    const unseenIds = await this.mailbox.findUnseen();
    console.log(`Found ${unseenIds.length} unread messages`);
    const batchCount = Math.ceil(unseenIds.length / this.batchSize);
    if (batchCount === 0) {
      return;
    }

    // Load N messages, process them all and only after that
    // load next N. This is made to avoid loading all messages
    // at once because that may lead to high memory consumption
    for (let i = batchCount; i--; ) {
      const rangeStart = i * this.batchSize;
      const rangeEnd = rangeStart + this.batchSize;
      const ids = unseenIds.slice(rangeStart, rangeEnd);
      await this._processMessageBatch(ids);
    }
  }

  _processMessageBatch (ids) {
    return new Promise((resolve, reject) => {
      let processedCount = 0;
      const onMessage = async message => {
        await this._processMessage(message);
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
    console.log(`Message #${message.id} classified as ${MessageTypes.names[messageType]}`);
    if (handler) {
      let markAsRead = false;
      try {
        markAsRead = await handler.processMessage(message);
      } catch (error) {
        console.warn(`Warning: message #${message.id} failed: ${error}`);
      }
      if (markAsRead) {
        await this.mailbox.markAsRead(message.id);
      }
    } else {
      console.log(`Message #${message.id}: no action for this type`);
    }
  }
}

module.exports = MailboxSorter;
