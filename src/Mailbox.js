const parseMessage = require('mailparser').simpleParser;

const Message = require('./Message');


class Mailbox {
  constructor (options) {
    this.connectionOptions = options.connection;
    this.readonly = (typeof options.readonly === 'undefined') ? true : options.readonly;
    this.imapConnection = options.connection;
    this.expungeOnClose = Boolean(options.expungeOnClose);
  }

  // Закрывает ящик и, если expungeOnClose == true, удаляет все письма,
  // которые были помечены удалёнными
  async close () {
    return new Promise(resolve => {
      if (!this._mailbox) {
        throw new Error('Can\'t close a mailbox that was not opened');
      }
      this.imapConnection.closeBox(this.expungeOnClose, resolve);
    });
  }

  deleteMessage (messageId) {
    return this._addFlags(messageId, ['\\Deleted']);
  }

  findUnseen () {
    return new Promise((resolve, reject) => {
      this.imapConnection.search(['UNSEEN'], (error, results) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(results);
      });
    });
  }

  loadMessages (range, onMessage, onError) {
    const fetchObject = this.imapConnection.fetch(range, {
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
  }

  async markAsRead (messageId) {
    await this._addFlags(messageId, ['\\Seen']);
  }

  async setBoxName (boxName) {
    await new Promise((resolve, reject) => {
      this.imapConnection.openBox(boxName, this.readonly, (error, box) => {
        if (error) {
          reject(error);
          return;
        }

        this._mailbox = box;
        resolve();
      });
    });
  }

  _addFlags (messageId, flags) {
    return new Promise((resolve, reject) => {
      this.imapConnection.addFlags(messageId, flags, error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
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
    const buffers = [];

    const [data, attributes] = await Promise.all([
      // Parse message body
      new Promise((resolve, reject) => {
        message.on('body', stream => {
          stream.on('data', buffer => buffers.push(buffer));
          try {
            stream.once && stream.once('error', reject);
            parseMessage(stream).then(resolve).catch(reject);
          } catch (error) {
            reject(error);
          }
        });
      }),
      // Wait for attributes
      new Promise(resolve => message.once('attributes', resolve)),
      // Wait for loading end
      new Promise(resolve => message.once('end', resolve))
    ]);
 
    return new Message(data, attributes, id, this, Buffer.concat(buffers));
  }
}

module.exports = Mailbox;
