const IMAP = require('imap');

const Message = require('./Message');
const parseMessage = require('mailparser').simpleParser;


class Mailbox {
  constructor (options) {
    this.boxName = options.boxName;
    this.connectionOptions = options.connection;
    this.readonly = (typeof options.readonly === 'undefined') ? true : options.readonly;
    this.imapConnection = new IMAP(options.connection);
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

  initialize () {
    return new Promise((resolve, reject) => {
      this.imapConnection.connect();
      this.imapConnection.once('ready', () => {
        this.imapConnection.openBox(this.boxName, this.readonly, (error, box) => {
          if (error) {
            reject(error);
            return;
          }

          this._mailbox = box;
          resolve();
        });
      });
      this.imapConnection.once('error', reject);
    });
  }

  messageCount () {
    return this.mailbox.messages.total;
  }

  _getInitializedConnection () {
    if (this.ready) {
      return Promise.resolve(this.imapConnection);
    } else {
      return new Promise(resolve => {
        this.onReady = resolve;
      });
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

  _loadMessageBodyStream (stream, onLoad) {
    let buffer = '';
    stream.on('data', chunk => {
      buffer += chunk.toString('utf8');
    });
    stream.once('end', () => {
      onLoad && onLoad(buffer);
    });
  }
}

module.exports = Mailbox;
