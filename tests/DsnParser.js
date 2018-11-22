const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { createFakeLogger } = require('./testing-utils');
const { readFileSync } = require('fs');
const { join } = require('path');
const parseMessage = require('mailparser').simpleParser;

const DsnParser = require('../src/DsnParser');
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

describe('DsnParser', function () {
  let fakeLogger, dsnParser;

  beforeEach(async function () {
    fakeLogger = createFakeLogger();
    dsnParser = new DsnParser(fakeLogger);
  });

  this.timeout(500);

  describe('#extract', function () {
    it('should correctly extract failure info from a standard DSN', async function () {
      const message = await loadMessage('standard-dsn.eml');
      const failureInfo = await dsnParser.extract(message);
      assert.isOk(failureInfo);
      assert.equal(failureInfo.dsnStatus, '4.4.1');
      assert.equal(failureInfo.listId, '<20180402-bitrix@youngreaders.ru>');
      assert.equal(failureInfo.message, message);
      assert.equal(failureInfo.recipient, 'zd_os@ail.ru');
      assert.equal(failureInfo.status, FailureTypes.TEMPORARY_FAILURE);
    });

    it('should return null on missing DSN attachment', async function () {
      const message = await loadMessage('email-without-dsn.eml');
      const failureInfo = await dsnParser.extract(message);
      assert.isNull(failureInfo);
    });

    it('should return null on missing original-recipient header', async function () {
      const message = await loadMessage('dsn-without-original-recipient.eml');
      const failureInfo = await dsnParser.extract(message);
      assert.isNull(failureInfo);
    });

    it('should set spam flag for mail.ru spam replies', async function () {
      const message = await loadMessage('mailru-spam-dsn.eml');
      const failureInfo = await dsnParser.extract(message);
      assert.isTrue(failureInfo.spam);
    });

    it('should not set spam flag for usual DSNs', async function () {
      const message = await loadMessage('standard-dsn.eml');
      const failureInfo = await dsnParser.extract(message);
      assert.isFalse(failureInfo.spam);
    });

    it('should add Diagnostic-Code header into comment', async function () {
      const message = await loadMessage('standard-dsn.eml');
      const failureInfo = await dsnParser.extract(message);
      assert.isTrue(failureInfo.comment.indexOf(
        `X-Postfix; connect to ail.ru[72.52.4.120]:25: Connection refused`
      ) !== -1);
    });

    it('should correctly extract DSNs without', async function () {
      const message = await loadMessage('syndicatru.eml');
      const failureInfo = await dsnParser.extract(message);
      assert.isOk(failureInfo);
      assert.equal(failureInfo.dsnStatus, '5.1.10');
      assert.equal(failureInfo.listId, null);
      assert.equal(failureInfo.message, message);
      assert.equal(failureInfo.recipient, 'sabina_094@bl.ru');
      assert.equal(failureInfo.status, FailureTypes.INVALID_ADDRESS);
    });
  });
});
