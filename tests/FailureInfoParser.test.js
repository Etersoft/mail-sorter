const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { simpleParser } = require('mailparser');

const FailureInfoParser = require('../src/FailureInfoParser');
const Message = require('../src/Message');


async function loadMessage (name) {
  const content = readFileSync(join(
    __dirname, 'message-examples', name
  ));
  const messageData = await simpleParser(content, { keepDeliveryStatus: true });
  return new Message(messageData, {}, 1, null, content);
}

describe('FailureInfoParser', function () {
  let dsnParser, specialHeaderParser, parser, result1, result2;

  beforeEach(async function () {
    result1 = {};
    result2 = {};
    dsnParser = {
      extract: mock.fn(() => Promise.resolve(result1))
    };
    specialHeaderParser = {
      extract: mock.fn(() => result2)
    };
    parser = new FailureInfoParser(dsnParser, specialHeaderParser);
  });

  describe('#extractFailureInfo', function () {
    it('should not call specialHeaderParser if dsnParser worked', async function () {
      const message = await loadMessage('standard-dsn.eml');
      const result = await parser.extractFailureInfo(message);
      assert.equal(result, result1);
      assert.ok(dsnParser.extract.mock.callCount() > 0);
      assert.equal(specialHeaderParser.extract.mock.callCount(), 0);
    });

    it('should call specialHeaderParser if dsnParser failed', async function () {
      result1 = null;
      const message = await loadMessage('standard-dsn.eml');
      const result = await parser.extractFailureInfo(message);
      assert.equal(result, result2);
      assert.ok(dsnParser.extract.mock.callCount() > 0);
      assert.ok(specialHeaderParser.extract.mock.callCount() > 0);
    });
  });
});
