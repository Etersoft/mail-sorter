class FailureInfoParser {
  constructor (dsnParser, specialHeaderParser) {
    this.dsnParser = dsnParser;
    this.specialHeaderParser = specialHeaderParser;
  }

  async extractFailureInfo (message) {
    return (await this.dsnParser.extract(message)) || this.specialHeaderParser.extract(message);
  }
}

module.exports = FailureInfoParser;
