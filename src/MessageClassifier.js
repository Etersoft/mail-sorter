const MessageTypes = require('./MessageTypes');


class MessageClassifier {
  classifyMessage (message) {
    const autoSubmitted = message.headers.get('auto-submitted');
    if (autoSubmitted === undefined || autoSubmitted === 'no') {
      return MessageTypes.HUMAN;
    } else {
      return MessageTypes.MAIL_SERVER;
    }
  }
}

module.exports = MessageClassifier;
