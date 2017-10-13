class Message {
  constructor (data) {
    this.attributes = data.attributes;
    this.body = data.body;
    this.header = data.header;
  }
}

module.exports = Message;
