const MessageTypes = require('./MessageTypes');

// Load 100 messages, process them all and only after that
// load next 100. This is made to avoid loading all messages
// at once because that may lead to high memory consumption
const MESSAGE_BATCH_SIZE = 1000;


class MailboxSorter {
  constructor (mailbox, classifier, handlerMap) {
    this.mailbox = mailbox;
    this.classifier = classifier;
    this.handlerMap = handlerMap;
  }

  async sort () {
    console.log(`Fetching list of unread messages...`);
    const unseenIds = await this.mailbox.findUnseen();
    console.log(`Found ${unseenIds.length} unread messages`);
    const batchCount = Math.ceil(unseenIds.length / MESSAGE_BATCH_SIZE);
    for (let i = batchCount; --i; ) {
      const rangeStart = i * MESSAGE_BATCH_SIZE;
      const rangeEnd = rangeStart + MESSAGE_BATCH_SIZE;
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
      const markAsRead = await handler.processMessage(message);
      if (markAsRead) {
        await this.mailbox.markAsRead(message.id);
      }
    } else {
      console.log(`Message #${message.id}: no action for this type`);
    }
  }
}

module.exports = MailboxSorter;
