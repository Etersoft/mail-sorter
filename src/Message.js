class Message {
  constructor (data, attributes, id, mailbox) {
    this.attributes = attributes;

    this.attachments = data.attachments;
    this.headers = data.headers;
    this.html = data.html;
    this.text = data.text;
    this.textAsHtml = data.textAsHtml;

    this.id = id;

    this.mailbox = mailbox;
  }

  markAsRead () {
    return new Promise((resolve, reject) => {
      this.mailbox.delFlag(id, 'UNSEEN', error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

module.exports = Message;
