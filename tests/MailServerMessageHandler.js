const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const { createFakeLogger } = require('./testing-utils');

const FailureTypes = require('../src/FailureTypes');
const MailServerMessageHandler = require('../src/handlers/MailServerMessageHandler');


chai.use(chaiAsPromised);
const { assert } = chai;

describe('MailServerMessageHandler', function() {
  const testAddress = 'test-non-existent@etersoft.ru';
  const statsActions = ['updated stats'];
  let fakeDb, fakeStatsTracker, fakeFailureParser, failureInfo, handler, message;

  beforeEach(function () {
    message = {
      uid: 123
    };
    fakeDb = {
      disableEmailsForAddress: sinon.spy(() => Promise.resolve(true))
    };
    fakeStatsTracker = {
      countFailure: sinon.spy(() => Promise.resolve(statsActions)),
      getTemporaryFailureCount: sinon.spy(() => Promise.resolve(0))
    };
    fakeFailureParser = {
      extractFailureInfo: sinon.spy(() => Promise.resolve(failureInfo))
    };
    failureInfo = {
      comment: `DSN status = 5.1.1`,
      dsnStatus: '5.1.1',
      listId: 'test-list-id',
      message,
      recipient: testAddress,
      status: FailureTypes.INVALID_ADDRESS
    };
    handler = new MailServerMessageHandler(fakeDb, fakeStatsTracker, fakeFailureParser, {
      maxTemporaryFailures: 2
    });
  });

  this.timeout(500);

  describe('#processMessage', function () {
    it('should return error on failure to extract info', async function () {
      failureInfo = null;
      const result = await handler.processMessage(message);
      assert.isTrue(result.skipped);
      assert.isNotOk(result.performedActions && result.performedActions.length);
      assert.isFalse(fakeStatsTracker.countFailure.called);
    });

    it('should count stats only once for each message', async function () {
      const result = await handler.processMessage(message);
      assert.isTrue(fakeStatsTracker.countFailure.calledOnce);
    });

    it('should exclude from database non-temporary failures', async function () {
      const result = await handler.processMessage(message);
      assert.isTrue(fakeDb.disableEmailsForAddress.calledOnce);
      assert.isTrue(fakeDb.disableEmailsForAddress.calledWith(testAddress));
      assert.isFalse(result.skipped);
      assert.isOk(result.performedActions.length);
    });

    it('should not include additional action when DB returned false', async function () {
      fakeDb.disableEmailsForAddress = () => false;
      const result = await handler.processMessage(message);
      assert.isOk(result.performedActions.indexOf(
        'disabled emails (excluded from mailing database)'
      ) === -1);
    });



    it('should not exclude temp failures that do not exceed limit', async function () {
      failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
      const result = await handler.processMessage(message);
      assert.isFalse(fakeDb.disableEmailsForAddress.called);
    });

    it('should not skip temp failures that do not exceed limit', async function () {
      failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
      const result = await handler.processMessage(message);
      assert.isFalse(result.skipped);
    });

    it('should not claim to perform actions on temp failures that do not exceed limit',
    async function () {
      failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
      const result = await handler.processMessage(message);
      assert.deepEqual(result.performedActions, statsActions);
    });



    it('should exclude temp failures that exceed limit', async function () {
      failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
      fakeStatsTracker.getTemporaryFailureCount = sinon.spy(() => Promise.resolve(3));
      const result = await handler.processMessage(message);
      assert.isTrue(fakeDb.disableEmailsForAddress.calledWith(testAddress));
    });

    it('should not skip temp failures that exceed limit', async function () {
      failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
      fakeStatsTracker.getTemporaryFailureCount = sinon.spy(() => Promise.resolve(3));
      const result = await handler.processMessage(message);
      assert.isFalse(result.skipped);
    });

    it('should perform actions on temp failures that exceed limit', async function () {
      failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
      fakeStatsTracker.getTemporaryFailureCount = sinon.spy(() => Promise.resolve(3));
      const result = await handler.processMessage(message);
      assert.equal(result.performedActions.length, 2);
    });
  });
});
