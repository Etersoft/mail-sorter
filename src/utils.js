const FROM_ADDRESS_REGEXP = /<(.+)>/i;


module.exports = {
  extractFromAddress (message) {
    let from = message.headers.get('from');
    if (typeof from !== 'string') {
      from = from.text;
    }

    const match = from.match(FROM_ADDRESS_REGEXP);
    if (match) {
      return match[1];
    }

    return from;
  }
};
