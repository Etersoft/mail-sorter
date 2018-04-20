const FROM_ADDRESS_REGEXP = /<(.+)>/i;


const utils = {
  extractAddress (from) {
    if (typeof from !== 'string' && from) {
      from = from.text;
    }

    return utils.unwrapFrom(from);
  },
  unwrapFrom (from) {
    if (typeof from !== 'string') {
      return undefined;
    }

    const match = from.match(FROM_ADDRESS_REGEXP);

    if (match) {
      return match[1];
    }

    return from;
  }
};
module.exports = utils;
