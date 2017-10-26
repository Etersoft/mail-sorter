const FROM_ADDRESS_REGEXP = /<(.+)>/i;


const utils = {
  extractFromAddress (message) {
    let from = message.headers.get('from');
    if (typeof from !== 'string') {
      from = from.text;
    }

    return utils.unwrapFrom(from);
  },
  unwrapFrom (from) {
    const match = from.match(FROM_ADDRESS_REGEXP);

    if (match) {
      return match[1];
    }

    return from;
  }
};
module.exports = utils;
