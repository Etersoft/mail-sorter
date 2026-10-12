const { simpleParser } = require('mailparser');

const Message = require('./Message');


// mailparser 3 по умолчанию склеивает части message/delivery-status с текстом
// письма; DsnParser нужны они отдельными вложениями
const PARSER_OPTIONS = { keepDeliveryStatus: true };

class Mailbox {
  constructor (options) {
    this.readonly = (typeof options.readonly === 'undefined') ? true : options.readonly;
    // Клиент ImapFlow
    this.client = options.connection;
    this.expungeOnClose = Boolean(options.expungeOnClose);
    this._mailbox = null;
  }

  // Закрывает ящик и соединение. Если expungeOnClose == true, удаляет все письма,
  // которые были помечены удалёнными
  async close () {
    if (!this._mailbox) {
      throw new Error('Can\'t close a mailbox that was not opened');
    }
    await this._closeCurrentBox();
    await this.client.logout();
  }

  async deleteMessage (uid) {
    await this.client.messageFlagsAdd(String(uid), ['\\Deleted'], { uid: true });
  }

  async findUnseen () {
    return (await this.client.search({ seen: false }, { uid: true })) || [];
  }

  // Загружает письма с указанными UID и вызывает для каждого onMessage.
  // Письма сначала загружаются целиком: imapflow не позволяет выполнять другие
  // команды IMAP (например, пометку прочитанным) внутри цикла fetch
  async loadMessages (uids, onMessage, onError) {
    let fetched;
    try {
      fetched = await this.client.fetchAll(uids.join(','), {
        internalDate: true,
        source: true,
        uid: true
      }, { uid: true });
    } catch (error) {
      if (onError) {
        onError(error);
        return;
      }
      throw error;
    }

    for (const item of fetched) {
      try {
        const data = await simpleParser(item.source, PARSER_OPTIONS);
        const attributes = { date: item.internalDate, uid: item.uid };
        await onMessage(new Message(data, attributes, item.seq, this, item.source));
      } catch (error) {
        if (!onError) {
          throw error;
        }
        onError(error);
      }
    }
  }

  async initialize () {
    if (!this.client.usable) {
      await this.client.connect();
    }
  }

  async markAsRead (uid) {
    await this.client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
  }

  async setBoxName (boxName) {
    if (this._mailbox) {
      await this._closeCurrentBox();
    }
    this._mailbox = await this.client.mailboxOpen(boxName, { readOnly: this.readonly });
  }

  async _closeCurrentBox () {
    // CLOSE удаляет письма с флагом \Deleted, а при переходе в другой ящик
    // или LOGOUT они остаются
    if (this.expungeOnClose && !this.readonly) {
      await this.client.mailboxClose();
    }
  }
}

module.exports = Mailbox;
