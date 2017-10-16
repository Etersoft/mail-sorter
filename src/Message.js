const FROM_FIELD_REGEXP = /<(.+)>/;


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
    const fromObject = this.headers.get('from');
    if (!fromObject) return null;

    const fromString = fromObject.text;
    if (!fromString) return null;

    const match = FROM_FIELD_REGEXP.exec(fromString);
    return match && match[1];
  }
}

module.exports = Message;
