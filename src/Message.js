const { extractAddress } = require('./utils');
const parseMessage = require('mailparser').simpleParser;


class Message {
  constructor (data, attributes, id, mailbox, source) {
    this.attributes = attributes;

    this.attachments = data.attachments;
    this.headers = data.headers;
    this.html = data.html;
    this.text = data.text;
    this.textAsHtml = data.textAsHtml;
    this.source = source;
    this.subject = data.subject;
    this.type = null;

    this.id = id;
    this.mailbox = mailbox;
    this.extractAdditionalAttachmentSource();
  }

  get date () {
    return this.attributes.date;
  }

  get fromAddress () {
    return extractAddress(this.headers.get('from'));
  }

  extractAdditionalAttachmentSource () {
    const stringSource = this.source.toString('utf8');
    const contentType = this.headers.get('content-type');
    if (contentType && contentType.params) {
      const boundary = contentType.params.boundary;
      const parts = stringSource.split('--' + boundary);
      const last = parts[parts.length - 2];
      if (last) {
        this.additionalAttachmentString = last.split('\n').slice(4).join('\n');
      }
    }
  }

  getAdditionalAttachment () {
    if (!this.additionalAttachmentString) {
      return Promise.resolve(null);
    }
    return parseMessage(this.additionalAttachmentString);
  }

  get replyToAddress () {
    return extractAddress(this.headers.get('reply-to'));
  }

  get toAddress () {
    return extractAddress(this.headers.get('to'));
  }

  get uid () {
    return this.attributes.uid;
  }
}

module.exports = Message;
