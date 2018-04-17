const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { createFakeLogger } = require('./testing-utils');
const { readFileSync } = require('fs');
const { join } = require('path');
const parseMessage = require('mailparser').simpleParser;

const SpecialHeaderParser = require('../src/SpecialHeaderParser');
const Message = require('../src/Message');
const FailureTypes = require('../src/FailureTypes');


chai.use(chaiAsPromised);
const { assert } = chai;

async function loadMessage (name) {
  const content = readFileSync(join(
    __dirname, 'message-examples', name
  ));
  const messageData = await parseMessage(content);
  return new Message(messageData, {}, 1, null, content);
}

describe('SpecialHeaderParser', function () {
  let fakeLogger, dsnParser;

  beforeEach(async function () {
    fakeLogger = createFakeLogger();
    dsnParser = new SpecialHeaderParser(fakeLogger);
  });

  this.timeout(500);

  describe('#extract', function () {
    it('should correctly extract failure info from a mail.ru reply', async function () {
      const message = await loadMessage('mailru-x-failed-recipients.eml');
      const failureInfo = await dsnParser.extract(message);
      assert.isOk(failureInfo);
      assert.equal(failureInfo.dsnStatus, '<unknown>');
      assert.isNull(failureInfo.listId);
      assert.equal(failureInfo.message, message);
      assert.equal(failureInfo.recipient, 'ucdb@olympus.ru');
      assert.equal(failureInfo.status, FailureTypes.INVALID_ADDRESS);
    });
  });
});
