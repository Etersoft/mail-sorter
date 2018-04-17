const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const { readFileSync } = require('fs');
const { join } = require('path');
const parseMessage = require('mailparser').simpleParser;

const FailureInfoParser = require('../src/FailureInfoParser');
const Message = require('../src/Message');


chai.use(chaiAsPromised);
const { assert } = chai;

async function loadMessage (name) {
  const content = readFileSync(join(
    __dirname, 'message-examples', name
  ));
  const messageData = await parseMessage(content);
  return new Message(messageData, {}, 1, null, content);
}

describe('FailureInfoParser', function () {
  let dsnParser, specialHeaderParser, parser, result1, result2;

  beforeEach(async function () {
    result1 = {};
    result2 = {};
    dsnParser = {
      extract: sinon.spy(() => Promise.resolve(result1))
    };
    specialHeaderParser = {
      extract: sinon.spy(() => result2)
    };
    parser = new FailureInfoParser(dsnParser, specialHeaderParser);
  });

  this.timeout(500);

  describe('#extractFailureInfo', function () {
    it('should not call specialHeaderParser if dsnParser worked', async function () {
      const message = await loadMessage('standard-dsn.eml');
      const result = await parser.extractFailureInfo(message);
      assert.equal(result, result1);
      assert.isTrue(dsnParser.extract.called);
      assert.isFalse(specialHeaderParser.extract.called);
    });

    it('should call specialHeaderParser if dsnParser failed', async function () {
      result1 = null;
      const message = await loadMessage('standard-dsn.eml');
      const result = await parser.extractFailureInfo(message);
      assert.equal(result, result2);
      assert.isTrue(dsnParser.extract.called);
      assert.isTrue(specialHeaderParser.extract.called);
    });
  });
});
