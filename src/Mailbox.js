const IMAP = require('imap');
const parseMessage = require('mailparser').simpleParser;

const Message = require('./Message');


class Mailbox {
  constructor (options) {
    this.boxName = options.boxName;
    this.connectionOptions = options.connection;
    this.readonly = (typeof options.readonly === 'undefined') ? true : options.readonly;
    this.imapConnection = options.connection;
  }

  loadMessagesRange (from, to, onMessage, onError) {
    const range = from + ':' + to;
    const fetchObject = this.imapConnection.seq.fetch(range, {
      bodies: ''
    });

    fetchObject.on('message', (messageInfo, id) => {
      this._loadMessage(messageInfo, id).then(onMessage).catch(onError);
    });

    fetchObject.once('error', error => {
      if (onError) {
        onError(error);
      } else {
        throw error;
      }
    });
  }

  async initialize () {
    await this._ensureConnectionIsReady();
    await new Promise((resolve, reject) => {
      this.imapConnection.openBox(this.boxName, this.readonly, (error, box) => {
        if (error) {
          reject(error);
          return;
        }

        this._mailbox = box;
        resolve();
      });
    });
  }

  messageCount () {
    return this.mailbox.messages.total;
  }

  _ensureConnectionIsReady () {
    if (this.imapConnection.state !== 'authenticated') {
      return new Promise((resolve, reject) => {
        this.imapConnection.connect();
        this.imapConnection.once('ready', resolve);
        this.imapConnection.once('error', reject);
      });
    } else {
      return Promise.resolve();
    }
  }

  async _loadMessage (message, id) {
    const [data, attributes] = await Promise.all([
      // Parse message body
      new Promise((resolve, reject) => {
        message.on('body', stream => {
          parseMessage(stream).then(resolve).catch(reject);
        });
      }),
      // Wait for attributes
      new Promise(resolve => message.once('attributes', resolve)),
      // Wait for loading end
      new Promise(resolve => message.once('end', resolve))
    ]);
 
    return new Message(data, attributes, id, this);
  }
}

module.exports = Mailbox;
