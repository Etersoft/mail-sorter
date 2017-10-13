const IMAP = require('imap');

const Message = require('./Message');


class Mailbox {
  constructor (options) {
    this.boxName = options.boxName;
    this.connectionOptions = options.connection;
    this.readonly = (typeof options.readonly === 'undefined') ? true : options.readonly;
    this.imapConnection = new IMAP(options.connection);
  }

  fetchMessages () {
    return new Promise((resolve, reject) => {
      const fetchObject = this.imapConnection.seq.fetch('1:2', {
        bodies: [
          'HEADER.FIELDS (FROM, TO)',
          'TEXT'
        ]
      });

      const messages = [];

      fetchObject.on('message', async (message, seqNumber) => {
        console.log(seqNumber);
        messages.push(await this.loadMessage(message, seqNumber));
      });

      fetchObject.once('error', reject);

      fetchObject.on('end', () => {
        setTimeout(() => {
          resolve(messages);
        }, 500);
      });
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

          this.mailbox = box;
          resolve();
        });
      });
      this.imapConnection.once('error', reject);
    });
  }

  loadMessage (message, index) {
    return new Promise(resolve => {
      let header, body, attributes;

      message.on('body', async (stream, info) => {
        console.log(index + 'Message [%s] found, %d total bytes', info.which, info.size);
        const buffer = await this.loadMessageBodyStream(stream, index);
        if (info.which === 'TEXT') {
          body = buffer;
        } else {
          header = IMAP.parseHeader(buffer);
        }
      });

      message.once('attributes', attr => {
        attributes = attr;
      });

      message.once('end', () => {
        setTimeout(() => {
          resolve(new Message({
            header, body, attributes
          }));
        }, 300);
      });
    });
  }

  loadMessageBodyStream (stream, index) {
    return new Promise(resolve => {
      let buffer = '';
      stream.on('data', chunk => {
        console.log(index + 'Body data' + chunk);
        buffer += chunk.toString('utf8');
      });
      stream.once('end', () => {
        setTimeout(() => resolve(buffer), 100);
      });
    });
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
}

module.exports = Mailbox;
