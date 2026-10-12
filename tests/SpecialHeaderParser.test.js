const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { simpleParser } = require('mailparser');
const { createFakeLogger } = require('./testing-utils');

const SpecialHeaderParser = require('../src/SpecialHeaderParser');
const Message = require('../src/Message');
const FailureTypes = require('../src/FailureTypes');


async function loadMessage (name) {
  const content = readFileSync(join(
    __dirname, 'message-examples', name
  ));
  const messageData = await simpleParser(content, { keepDeliveryStatus: true });
  return new Message(messageData, {}, 1, null, content);
}

describe('SpecialHeaderParser', function () {
  let fakeLogger, dsnParser;

  beforeEach(async function () {
    fakeLogger = createFakeLogger();
    dsnParser = new SpecialHeaderParser(fakeLogger);
  });

  describe('#extract', function () {
    it('should correctly extract failure info from a mail.ru reply', async function () {
      const message = await loadMessage('mailru-x-failed-recipients.eml');
      const failureInfo = await dsnParser.extract(message);
      assert.ok(failureInfo);
      assert.equal(failureInfo.dsnStatus, '<unknown>');
      assert.equal(failureInfo.listId, null);
      assert.equal(failureInfo.message, message);
      assert.equal(failureInfo.recipient, 'ucdb@olympus.ru');
      assert.equal(failureInfo.status, FailureTypes.INVALID_ADDRESS);
    });
  });
});
