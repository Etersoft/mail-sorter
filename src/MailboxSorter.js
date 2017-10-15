const MessageTypes = require('./MessageTypes');

// Load 100 messages, process them all and only after that
// load next 100. This is made to avoid loading all messages
// at once because that may lead to high memory consumption
const MESSAGE_BATCH_SIZE = 1;


class MailboxSorter {
  constructor (mailbox, classifier, handlerMap) {
    this.mailbox = mailbox;
    this.classifier = classifier;
    this.handlerMap = handlerMap;
  }

  async sort () {
    await this._processMessageBatch(9411);
  }

  _processMessageBatch (index) {
    return new Promise((resolve, reject) => {
      // +1 in the end because message numbers start from 1
      const rangeStart = index * MESSAGE_BATCH_SIZE + 1;
      // -1 in the end because range is inclusive
      const rangeEnd = rangeStart + MESSAGE_BATCH_SIZE - 1;

      let processedCount = 0;
      const onMessage = async message => {
        await this._processMessage(message);
        processedCount++;
        if (processedCount === MESSAGE_BATCH_SIZE) {
          resolve();
        }
      };

      this.mailbox.loadMessagesRange(
        rangeStart, rangeEnd, onMessage, reject
      );
    });
  }

  async _processMessage (message) {
    console.log(message);
    return;
    const messageType = this.classifier.classifyMessage(message);
    const handler = this.handlerMap[messageType];
    if (handler) {
      await handler.processMessage(message);
    }
  }
}

module.exports = MailboxSorter;
