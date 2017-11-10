const { extractAddress } = require('./utils');


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

  get fromAddress () {
    return extractAddress(this.headers.get('from'));
  }

  get toAddress () {
    return extractAddress(this.headers.get('to'));
  }

  get uid () {
    return this.attributes.uid;
  }
}

module.exports = Message;
